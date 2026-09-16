// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

import {CLSunSwapV4Test} from "./v4/CLSunSwapV4.t.sol";
import {CLNativeSunSwapV4Test} from "./v4/CLNativeSunSwapV4.t.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {ReferralVault} from "src/ReferralVault.sol";

contract SDKExactOutV4Test is CLSunSwapV4Test {
    function sdkArgs(string memory tokens, address recipient, uint256 maximum)
        internal view returns (string[] memory args)
    {
        args = new string[](12);
        args[0] = "node";
        args[1] = vm.envString("SDK_ENCODER");
        args[2] = tokens;
        args[3] = vm.toString(poolKey0.parameters);
        args[4] = vm.toString(recipient);
        args[5] = vm.toString(maximum);
        args[6] = "v4";
        args[7] = vm.toString(uint256(1 ether));
        args[8] = "0";
        args[9] = "0";
        args[10] = args[7];
        args[11] = string.concat(vm.toString(uint256(poolKey0.fee)), ",", vm.toString(uint256(poolKey1.fee)));
    }

    function sdk(string memory tokens, address recipient, uint256 maximum)
        internal returns (bytes memory commands, bytes[] memory inputs, uint256 value)
    {
        string[] memory args = sdkArgs(tokens, recipient, maximum);
        return abi.decode(vm.ffi(args), (bytes, bytes[], uint256));
    }

    function test_sdk_userPaysActualDebt() public {
        (bytes memory commands, bytes[] memory inputs,) = sdk(
            string.concat(vm.toString(address(token0)), ",", vm.toString(address(token1))), alice, 2 ether);
        // Less than maximum, enough for actual debt: a budget pull would fail.
        token0.mint(alice, 1.1 ether);
        vm.prank(alice);
        permit2.approve(address(token0), address(router), uint160(1.1 ether), type(uint48).max);
        uint256 beforeBalance = token0.balanceOf(alice);
        vm.prank(alice);
        router.execute(commands, inputs, block.timestamp);
        uint256 paid = beforeBalance - token0.balanceOf(alice);
        assertGt(paid, 1 ether);
        assertLt(paid, 1.1 ether);
        assertEq(token1.balanceOf(alice), 1 ether);
        assertEq(token0.balanceOf(address(router)), 0);
        assertEq(token1.balanceOf(address(router)), 0);
        assertEq(token0.balanceOf(address(safeVault)), 0);
    }

    function test_sdk_multihopThirdParty() public {
        address recipient = makeAddr("sdk-recipient");
        (bytes memory commands, bytes[] memory inputs,) = sdk(string.concat(
            vm.toString(address(token0)), ",", vm.toString(address(token1)), ",", vm.toString(address(token2))), recipient, 2 ether);
        token0.mint(alice, 2 ether);
        vm.prank(alice);
        router.execute(commands, inputs, block.timestamp);
        assertEq(token2.balanceOf(recipient), 1 ether);
        assertGt(token0.balanceOf(alice), 0);
        assertEq(token1.balanceOf(address(router)), 0);
        assertEq(token2.balanceOf(address(router)), 0);
    }

    function test_sdk_overBudgetRevertsAtomically() public {
        (bytes memory commands, bytes[] memory inputs,) = sdk(
            string.concat(vm.toString(address(token0)), ",", vm.toString(address(token1))), alice, 1 ether);
        token0.mint(alice, 2 ether);
        vm.expectRevert();
        vm.prank(alice);
        router.execute(commands, inputs, block.timestamp);
        assertEq(token0.balanceOf(alice), 2 ether);
        assertEq(token1.balanceOf(alice), 0);
    }

    function test_sdk_outputReferralAfterUserDebtSettlement() public {
        ReferralVault referral = new ReferralVault(address(this), address(router));
        referral.setMaxReferralBips(100);
        router.setReferralVault(address(referral));
        string[] memory args = sdkArgs(
            string.concat(vm.toString(address(token0)), ",", vm.toString(address(token1))), alice, 2 ether);
        args[9] = "100";
        (bytes memory commands, bytes[] memory inputs,) = abi.decode(vm.ffi(args), (bytes, bytes[], uint256));
        token0.mint(alice, 2 ether);
        vm.prank(alice); router.execute(commands, inputs, block.timestamp);
        assertEq(token1.balanceOf(alice), 1 ether);
        assertGt(token0.balanceOf(alice), 0);
        assertEq(token1.balanceOf(address(referral)), ((uint256(1 ether) - 1) * 10000 / 9900 + 1) / 100);
        assertEq(token0.balanceOf(address(referral)), 0);
        assertEq(token1.balanceOf(address(router)), 0);
        assertEq(token0.balanceOf(address(router)), 0);
        assertEq(token0.balanceOf(address(safeVault)), 0);
    }

    function test_sdk_exhaustedLiquidityCannotPassSweep() public {
        string[] memory args = sdkArgs(
            string.concat(vm.toString(address(token0)), ",", vm.toString(address(token1))), alice, 2_000_000 ether);
        args[7] = vm.toString(uint256(1_000_000 ether));
        args[10] = args[7];
        (bytes memory commands, bytes[] memory inputs,) = abi.decode(vm.ffi(args), (bytes, bytes[], uint256));
        token0.mint(alice, 2_000_000 ether);
        vm.expectRevert(abi.encodeWithSignature("ExactOutputUnfilled(uint256,uint256)",
            uint256(1_000_000 ether), uint256(10 ether - 1)));
        vm.prank(alice); router.execute(commands, inputs, block.timestamp);
        assertEq(token0.balanceOf(alice), 2_000_000 ether);
        assertEq(token1.balanceOf(alice), 0);
    }
}

contract SDKExactOutNativeTest is CLNativeSunSwapV4Test {
    function test_sdk_nativeActualSettlementAndRefund() public {
        ReferralVault referral = new ReferralVault(address(this), address(router));
        referral.setMaxReferralBips(100);
        router.setReferralVault(address(referral));
        address recipient = makeAddr("sdk-recipient");
        string[] memory args = new string[](12);
        args[0] = "node";
        args[1] = vm.envString("SDK_ENCODER");
        args[2] = string.concat(vm.toString(address(0)), ",", vm.toString(address(token1)));
        args[3] = vm.toString(poolKey0.parameters);
        args[4] = vm.toString(recipient);
        args[5] = vm.toString(uint256(2 ether));
        args[6] = "v4";
        args[7] = vm.toString(uint256(1 ether));
        args[8] = "0";
        args[9] = "100";
        args[10] = args[7];
        args[11] = vm.toString(uint256(poolKey0.fee));
        (bytes memory commands, bytes[] memory inputs, uint256 value) = abi.decode(vm.ffi(args), (bytes, bytes[], uint256));
        vm.deal(alice, value);
        uint256 managerBefore = address(poolManager).balance;
        vm.prank(alice);
        router.execute{value: value}(commands, inputs, block.timestamp);
        uint256 paid = address(poolManager).balance - managerBefore;
        assertGt(paid, 1 ether);
        assertLt(paid, value);
        assertEq(token1.balanceOf(recipient), 1 ether);
        assertEq(token1.balanceOf(address(referral)), ((uint256(1 ether) - 1) * 10000 / 9900 + 1) / 100);
        assertEq(address(referral).balance, 0);
        assertEq(recipient.balance, value - paid);
        assertEq(address(router).balance, 0);
        assertEq(address(safeVault).balance, 0);
    }
}
