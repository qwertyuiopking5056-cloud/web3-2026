// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title DigitalAsset
 * @notice 실무형 NFT 스마트 컨트랙트.
 * - 한정 발행 수량(MAX_SUPPLY) 및 민팅 가격(mintPrice) 관리
 * - 개별 토큰 메타데이터(URI) 온체인 저장 및 조회
 * - ReentrancyGuard 및 SafeTransfer 패턴 적용
 * - 가스비 최적화를 위한 Custom Error 적용
 */
contract DigitalAsset is ERC721URIStorage, Ownable, ReentrancyGuard {
    uint256 private _nextTokenId;
    uint256 public constant MAX_SUPPLY = 1000;
    uint256 public mintPrice = 0.01 ether;

    error MintPriceNotMet(uint256 required, uint256 provided);
    error MaxSupplyReached();
    error WithdrawFailed();
    error ZeroAddressRecipient();

    event AssetMinted(address indexed recipient, uint256 indexed tokenId, string tokenURI, uint256 price);
    event FundsWithdrawn(address indexed owner, uint256 amount);
    event MintPriceUpdated(uint256 newPrice);

    constructor(address initialOwner)
        ERC721("DigitalAsset", "DAST")
        Ownable(initialOwner)
    {
        _nextTokenId = 1;
    }

    /**
     * @notice 누구나 지정된 mintPrice를 지불하여 NFT를 발행할 수 있습니다.
     * @param uri 토큰의 메타데이터 URI (JSON 포맷의 IPFS/HTTPS 링크)
     */
    function mint(string calldata uri) external payable nonReentrant returns (uint256) {
        if (msg.value < mintPrice) {
            revert MintPriceNotMet(mintPrice, msg.value);
        }
        if (_nextTokenId > MAX_SUPPLY) {
            revert MaxSupplyReached();
        }

        uint256 tokenId = _nextTokenId;
        _nextTokenId++;

        _safeMint(msg.sender, tokenId);
        _setTokenURI(tokenId, uri);

        emit AssetMinted(msg.sender, tokenId, uri, msg.value);
        return tokenId;
    }

    /**
     * @notice 현재까지 발행된 총 토큰 수량 반환
     */
    function totalSupply() external view returns (uint256) {
        return _nextTokenId - 1;
    }

    /**
     * @notice 특정 주소가 보유한 모든 토큰 ID 목록을 반환합니다.
     * 외부 인덱서(Graph 등) 없이 프론트엔드가 직접 RPC로 보유 목록을 조회할 수 있도록 지원합니다.
     */
    function getTokensByOwner(address owner) external view returns (uint256[] memory) {
        if (owner == address(0)) {
            revert ZeroAddressRecipient();
        }
        uint256 balance = balanceOf(owner);
        uint256[] memory tokens = new uint256[](balance);
        uint256 count = 0;
        uint256 currentSupply = _nextTokenId - 1;

        for (uint256 i = 1; i <= currentSupply && count < balance; i++) {
            if (_ownerOf(i) == owner) {
                tokens[count] = i;
                count++;
            }
        }
        return tokens;
    }

    /**
     * @notice 관리자(Owner) 전용: 민팅 가격 변경
     */
    function setMintPrice(uint256 newPrice) external onlyOwner {
        mintPrice = newPrice;
        emit MintPriceUpdated(newPrice);
    }

    /**
     * @notice 관리자(Owner) 전용: 컨트랙트에 축적된 판매 대금(ETH) 출금
     */
    function withdraw() external onlyOwner nonReentrant {
        uint256 balance = address(this).balance;
        if (balance == 0) return;

        (bool success, ) = payable(owner()).call{value: balance}("");
        if (!success) {
            revert WithdrawFailed();
        }

        emit FundsWithdrawn(owner(), balance);
    }
}
