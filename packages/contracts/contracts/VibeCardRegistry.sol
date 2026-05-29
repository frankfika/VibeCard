// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract DappCardRegistry {
    struct ContentEntry {
        string contentType;
        string ipfsHash;
        bytes32 contentHash;
        uint256 timestamp;
        uint256 chainId;
    }

    mapping(address => ContentEntry[]) public userEntries;
    mapping(string => ContentEntry) public entryByIpfsHash;
    mapping(address => string) public latestProfile;

    event ContentPublished(
        address indexed author,
        string contentType,
        string ipfsHash,
        bytes32 contentHash,
        uint256 timestamp,
        uint256 chainId
    );

    event ProfileUpdated(address indexed author, string ipfsHash, uint256 timestamp);

    function publish(
        string calldata contentType,
        string calldata ipfsHash,
        bytes32 contentHash
    ) external {
        require(bytes(ipfsHash).length > 0, "IPFS hash required");
        require(entryByIpfsHash[ipfsHash].timestamp == 0, "Entry already exists");

        ContentEntry memory entry = ContentEntry({
            contentType: contentType,
            ipfsHash: ipfsHash,
            contentHash: contentHash,
            timestamp: block.timestamp,
            chainId: block.chainid
        });

        userEntries[msg.sender].push(entry);
        entryByIpfsHash[ipfsHash] = entry;

        if (keccak256(bytes(contentType)) == keccak256(bytes("profile"))) {
            latestProfile[msg.sender] = ipfsHash;
            emit ProfileUpdated(msg.sender, ipfsHash, block.timestamp);
        }

        emit ContentPublished(
            msg.sender,
            contentType,
            ipfsHash,
            contentHash,
            block.timestamp,
            block.chainid
        );
    }

    function publishBatch(
        string[] calldata contentTypes,
        string[] calldata ipfsHashes,
        bytes32[] calldata contentHashes
    ) external {
        require(
            contentTypes.length == ipfsHashes.length && ipfsHashes.length == contentHashes.length,
            "Array length mismatch"
        );

        for (uint256 i = 0; i < contentTypes.length; i++) {
            require(bytes(ipfsHashes[i]).length > 0, "IPFS hash required");
            if (entryByIpfsHash[ipfsHashes[i]].timestamp > 0) continue;

            ContentEntry memory entry = ContentEntry({
                contentType: contentTypes[i],
                ipfsHash: ipfsHashes[i],
                contentHash: contentHashes[i],
                timestamp: block.timestamp,
                chainId: block.chainid
            });

            userEntries[msg.sender].push(entry);
            entryByIpfsHash[ipfsHashes[i]] = entry;

            if (keccak256(bytes(contentTypes[i])) == keccak256(bytes("profile"))) {
                latestProfile[msg.sender] = ipfsHashes[i];
            }

            emit ContentPublished(
                msg.sender,
                contentTypes[i],
                ipfsHashes[i],
                contentHashes[i],
                block.timestamp,
                block.chainid
            );
        }
    }

    function getUserEntries(address user) external view returns (ContentEntry[] memory) {
        return userEntries[user];
    }

    function getUserEntriesByType(
        address user,
        string calldata contentType
    ) external view returns (ContentEntry[] memory) {
        ContentEntry[] memory all = userEntries[user];
        uint256 count = 0;

        for (uint256 i = 0; i < all.length; i++) {
            if (keccak256(bytes(all[i].contentType)) == keccak256(bytes(contentType))) {
                count++;
            }
        }

        ContentEntry[] memory filtered = new ContentEntry[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < all.length; i++) {
            if (keccak256(bytes(all[i].contentType)) == keccak256(bytes(contentType))) {
                filtered[idx] = all[i];
                idx++;
            }
        }

        return filtered;
    }

    function getLatestProfile(address user) external view returns (string memory) {
        return latestProfile[user];
    }

    function getEntry(string calldata ipfsHash) external view returns (ContentEntry memory) {
        return entryByIpfsHash[ipfsHash];
    }
}
