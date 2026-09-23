import { expect } from "chai";
import { ethers } from "hardhat";
import { DigitalAsset } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("DigitalAsset Contract Tests", function () {
  let digitalAsset: DigitalAsset;
  let owner: HardhatEthersSigner;
  let user1: HardhatEthersSigner;
  let user2: HardhatEthersSigner;

  const MINT_PRICE = ethers.parseEther("0.01");
  const SAMPLE_URI = "https://example.com/nft/1.json";

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();

    const DigitalAssetFactory = await ethers.getContractFactory("DigitalAsset");
    digitalAsset = (await DigitalAssetFactory.deploy(owner.address)) as DigitalAsset;
    await digitalAsset.waitForDeployment();
  });

  describe("배포 초기 상태 검증", function () {
    it("올바른 이름, 심볼, 초기 소유자를 가져야 한다", async function () {
      expect(await digitalAsset.name()).to.equal("DigitalAsset");
      expect(await digitalAsset.symbol()).to.equal("DAST");
      expect(await digitalAsset.owner()).to.equal(owner.address);
      expect(await digitalAsset.mintPrice()).to.equal(MINT_PRICE);
      expect(await digitalAsset.totalSupply()).to.equal(0n);
    });
  });

  describe("민팅 (mint) 검증", function () {
    it("민팅 가격보다 적은 ETH를 전송하면 MintPriceNotMet 에러로 Revert 되어야 한다", async function () {
      const underpaidAmount = ethers.parseEther("0.005");
      await expect(
        digitalAsset.connect(user1).mint(SAMPLE_URI, { value: underpaidAmount })
      ).to.be.revertedWithCustomError(digitalAsset, "MintPriceNotMet")
        .withArgs(MINT_PRICE, underpaidAmount);
    });

    it("정상적인 가격 지불 시 민팅되고 총 발행량이 증가해야 한다", async function () {
      const tx = await digitalAsset.connect(user1).mint(SAMPLE_URI, { value: MINT_PRICE });
      await tx.wait();

      expect(await digitalAsset.totalSupply()).to.equal(1n);
      expect(await digitalAsset.balanceOf(user1.address)).to.equal(1n);
      expect(await digitalAsset.ownerOf(1n)).to.equal(user1.address);
      expect(await digitalAsset.tokenURI(1n)).to.equal(SAMPLE_URI);
    });

    it("민팅 시 AssetMinted 이벤트가 발생해야 한다", async function () {
      await expect(
        digitalAsset.connect(user1).mint(SAMPLE_URI, { value: MINT_PRICE })
      )
        .to.emit(digitalAsset, "AssetMinted")
        .withArgs(user1.address, 1n, SAMPLE_URI, MINT_PRICE);
    });
  });

  describe("보유 토큰 목록 조회 (getTokensByOwner) 검증", function () {
    it("사용자가 여러 개의 토큰을 민팅했을 때 보유 토큰 ID 목록을 정확히 반환해야 한다", async function () {
      await digitalAsset.connect(user1).mint("uri1", { value: MINT_PRICE });
      await digitalAsset.connect(user2).mint("uri2", { value: MINT_PRICE });
      await digitalAsset.connect(user1).mint("uri3", { value: MINT_PRICE });

      const user1Tokens = await digitalAsset.getTokensByOwner(user1.address);
      expect(user1Tokens.length).to.equal(2);
      expect(user1Tokens[0]).to.equal(1n);
      expect(user1Tokens[1]).to.equal(3n);

      const user2Tokens = await digitalAsset.getTokensByOwner(user2.address);
      expect(user2Tokens.length).to.equal(1);
      expect(user2Tokens[0]).to.equal(2n);
    });

    it("0번 주소로 조회 시 ZeroAddressRecipient 에러로 Revert 되어야 한다", async function () {
      await expect(
        digitalAsset.getTokensByOwner(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(digitalAsset, "ZeroAddressRecipient");
    });
  });

  describe("관리자 기능 (Owner Controls) 검증", function () {
    it("Owner만 민팅 가격을 수정할 수 있고 이벤트가 발생해야 한다", async function () {
      const newPrice = ethers.parseEther("0.02");
      await expect(digitalAsset.connect(owner).setMintPrice(newPrice))
        .to.emit(digitalAsset, "MintPriceUpdated")
        .withArgs(newPrice);

      expect(await digitalAsset.mintPrice()).to.equal(newPrice);

      // 일반 유저가 변경 시도시 Revert
      await expect(
        digitalAsset.connect(user1).setMintPrice(newPrice)
      ).to.be.revertedWithCustomError(digitalAsset, "OwnableUnauthorizedAccount")
        .withArgs(user1.address);
    });

    it("Owner만 출금(withdraw)할 수 있어야 한다", async function () {
      // user1이 민팅하여 컨트랙트에 잔액 적립
      await digitalAsset.connect(user1).mint(SAMPLE_URI, { value: MINT_PRICE });

      const initialOwnerBalance = await ethers.provider.getBalance(owner.address);

      const withdrawTx = await digitalAsset.connect(owner).withdraw();
      const receipt = await withdrawTx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;

      const finalOwnerBalance = await ethers.provider.getBalance(owner.address);
      expect(finalOwnerBalance).to.equal(initialOwnerBalance + MINT_PRICE - gasUsed);

      // 일반 유저 출금 시도시 Revert
      await expect(
        digitalAsset.connect(user1).withdraw()
      ).to.be.revertedWithCustomError(digitalAsset, "OwnableUnauthorizedAccount")
        .withArgs(user1.address);
    });
  });
});
