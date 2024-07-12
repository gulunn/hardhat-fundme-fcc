const { assert, expect } = require("chai")
const { deployments, ethers, getNamedAccounts } = require("hardhat")
const { bigint } = require("hardhat/internal/core/params/argumentTypes")

describe("Fundme", async () => {
    // deploy contract before each
    let fundMe
    let deployer
    let mockV3Aggregator
    const sendValue = await ethers.parseEther("1")

    beforeEach(async () => {
        deployer = (await getNamedAccounts()).deployer
        await deployments.fixture("all")
        fundMe = await ethers.getContract("FundMe", deployer)
        mockV3Aggregator = await ethers.getContract(
            "MockV3Aggregator",
            deployer
        )
    })

    describe("Constructor", async () => {
        it("Should set the aggregator address correctly", async () => {
            let res = await fundMe.s_priceFeed
            assert.equal(res, mockV3Aggregator.address)
        })
    })

    describe("Fund", async () => {
        it("Should failed if didn't send enough ETH", async () => {
            await expect(fundMe.fund()).to.be.revertedWith(
                "You need to spend more ETH!"
            )
        })

        it("Should update the amount funded data structure", async () => {
            await fundMe.fund({ value: sendValue })
            const res = await fundMe.getAddressToAmountFunded(deployer)
            assert.equal(res.toString(), sendValue.toString())
        })

        it("Should add funders to funders array", async () => {
            await fundMe.fund({ value: sendValue })
            const res = await fundMe.getFunder(0)
            assert.equal(res.toString(), deployer)
        })
    })

    describe("Withdraw", async () => {
        beforeEach(async () => {
            await fundMe.fund({ value: sendValue })
        })

        it("Should withdraw from a single funder correctly", async () => {
            // Arrange
            const startContractBalance = await ethers.provider.getBalance(
                fundMe.target
            )
            const startDeployerBalance = await ethers.provider.getBalance(
                deployer
            )
            // Act
            const txResponse = await fundMe.withdraw()
            const txreceipt = await txResponse.wait(1)
            const { gasUsed, gasPrice } = txreceipt
            const gasCost = gasUsed * gasPrice

            const endContractBalance = await ethers.provider.getBalance(
                fundMe.target
            )
            const enddeployerBalance = await ethers.provider.getBalance(
                deployer
            )
            // Assert
            assert.equal(endContractBalance, 0)
            assert.equal(
                (startContractBalance + startDeployerBalance).toString(),
                (enddeployerBalance + gasCost).toString()
            )
        })

        it("Should withdraw from multiple funders correctly", async () => {
            // Arrange
            const accounts = await ethers.getSigners()
            for (let i = 0; i <= 5; i++) {
                const fundMeConnect = await fundMe.connect(accounts[i])
                await fundMeConnect.fund({ value: sendValue })
            }
            const startContractBalance = await ethers.provider.getBalance(
                fundMe.target
            )
            const startDeployerBalance = await ethers.provider.getBalance(
                deployer
            )

            // Act
            const txResponse = await fundMe.withdraw()
            const txreceipt = await txResponse.wait(1)
            const { gasUsed, gasPrice } = txreceipt
            const gasCost = gasUsed * gasPrice

            const endContractBalance = await ethers.provider.getBalance(
                fundMe.target
            )
            const enddeployerBalance = await ethers.provider.getBalance(
                deployer
            )

            // Assert
            assert.equal(endContractBalance, 0)
            assert.equal(
                (startContractBalance + startDeployerBalance).toString(),
                (enddeployerBalance + gasCost).toString()
            )
            // make sure that funders are reset properly
            await expect(fundMe.getFunder(0)).to.be.reverted
            for (i = 0; i <= 5; i++) {
                assert.equal(
                    await fundMe.getAddressToAmountFunded(accounts[i]),
                    0
                )
            }
        })

        it("Should failed when another account trying to withdraw", async () => {
            const accounts = await ethers.getSigners()
            const attacker = accounts[1]
            const attackerConnectedContract = await fundMe.connect(attacker)

            await expect(
                attackerConnectedContract.withdraw()
            ).to.be.revertedWithCustomError(fundMe, "FundMe__NotOwner")
        })
    })
})
