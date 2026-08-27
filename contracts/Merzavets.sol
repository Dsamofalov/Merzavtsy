// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface IERC5192 {
    event Locked(uint256 tokenId);
    event Unlocked(uint256 tokenId);

    function locked(uint256 tokenId) external view returns (bool);
}

interface IMerzavetsWorldInitializer {
    function initializeCreature(
        uint256 tokenId,
        address owner,
        bytes32 genomeSeed,
        uint64 birthTimestamp
    ) external;
}

/// @title Merzavets
/// @notice Account-bound identity for a single non-transferable creature per account.
contract Merzavets is ERC721, Ownable, IERC5192 {
    error AlreadyBorn();
    error Soulbound();
    error WorldAlreadyConfigured();
    error WorldNotConfigured();
    error InvalidWorld();

    struct BirthData {
        uint64 birthBlock;
        uint64 birthTimestamp;
        bytes32 genomeSeed;
        bytes32 genomeHash;
    }

    uint256 private _nextTokenId = 1;
    address public world;

    mapping(address owner => uint256 tokenId) public tokenOf;
    mapping(uint256 tokenId => BirthData data) public birthData;

    event Born(
        uint256 indexed tokenId,
        address indexed owner,
        bytes32 indexed genomeSeed,
        uint64 birthBlock,
        uint64 birthTimestamp
    );
    event WorldConfigured(address indexed world);

    constructor(address initialOwner) ERC721("Merzavets", "MRZV") Ownable(initialOwner) {}

    function setWorld(address world_) external onlyOwner {
        if (world != address(0)) revert WorldAlreadyConfigured();
        if (world_ == address(0)) revert InvalidWorld();
        world = world_;
        emit WorldConfigured(world_);
    }

    function birth() external returns (uint256 tokenId) {
        if (world == address(0)) revert WorldNotConfigured();
        if (tokenOf[msg.sender] != 0) revert AlreadyBorn();

        tokenId = _nextTokenId++;
        bytes32 seed = keccak256(
            abi.encode(
                block.chainid,
                msg.sender,
                block.number,
                blockhash(block.number - 1),
                address(this),
                tokenId
            )
        );

        uint64 bornAtBlock = uint64(block.number);
        uint64 bornAtTime = uint64(block.timestamp);

        tokenOf[msg.sender] = tokenId;
        birthData[tokenId] = BirthData({
            birthBlock: bornAtBlock,
            birthTimestamp: bornAtTime,
            genomeSeed: seed,
            genomeHash: keccak256(abi.encode(seed))
        });

        _mint(msg.sender, tokenId);
        IMerzavetsWorldInitializer(world).initializeCreature(tokenId, msg.sender, seed, bornAtTime);

        emit Locked(tokenId);
        emit Born(tokenId, msg.sender, seed, bornAtBlock, bornAtTime);
    }

    function locked(uint256 tokenId) external view override returns (bool) {
        _requireOwned(tokenId);
        return true;
    }

    function supportsInterface(bytes4 interfaceId) public view override returns (bool) {
        return interfaceId == type(IERC5192).interfaceId || super.supportsInterface(interfaceId);
    }

    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        if (_ownerOf(tokenId) != address(0)) revert Soulbound();
        return super._update(to, tokenId, auth);
    }
}
