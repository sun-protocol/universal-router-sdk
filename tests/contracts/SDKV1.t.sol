// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {DeployPermit2} from "permit2/test/utils/DeployPermit2.sol";
import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";
import {MockERC20} from "./mock/MockERC20.sol";
import {V1OutputFactory, V1OutputExchange} from "./V1ExactOutput.t.sol";
import {UniversalRouter} from "src/UniversalRouter.sol";
import {RouterParameters} from "src/base/RouterImmutables.sol";
import {ReferralVault} from "src/ReferralVault.sol";

// Models an exchange consuming less than the Router's reserve-derived quote.
contract SDKV1DiscountExchange {
    MockERC20 token;
    constructor(MockERC20 token_) { token = token_; }
    function tokenToTrxTransferOutput(uint256 out, uint256 maximum, uint256, address recipient)
        external returns (uint256)
    {
        require(out <= maximum);
        token.transferFrom(msg.sender, address(this), out);
        (bool ok,) = recipient.call{value: out}(""); require(ok);
        return out;
    }
    receive() external payable {}
}

contract SDKV1Test is Test, DeployPermit2 {
    MockERC20 a;
    MockERC20 b;
    V1OutputFactory factory;
    V1OutputExchange poolA;
    V1OutputExchange poolB;
    UniversalRouter router;
    IAllowanceTransfer permit2;
    ReferralVault referral;
    address recipient = address(0xBEEF);
    address safe = address(0xCAFE);

    function setUp() public {
        a = new MockERC20(); b = new MockERC20();
        factory = new V1OutputFactory();
        poolA = new V1OutputExchange(a, factory);
        poolB = new V1OutputExchange(b, factory);
        factory.set(address(a), payable(address(poolA)));
        factory.set(address(b), payable(address(poolB)));
        a.mint(address(poolA), 1_000_000); b.mint(address(poolB), 1_000_000);
        vm.deal(address(poolA), 1_000_000); vm.deal(address(poolB), 1_000_000);
        permit2 = IAllowanceTransfer(deployPermit2());
        RouterParameters memory params;
        params.v1Factory = address(factory); params.permit2 = address(permit2); params.safeVault = safe;
        router = new UniversalRouter(params);
        referral = new ReferralVault(address(this), address(router));
        referral.setMaxReferralBips(1000); router.setReferralVault(address(referral));
        a.mint(address(this), 100_000);
        a.approve(address(permit2), type(uint256).max);
        permit2.approve(address(a), address(router), type(uint160).max, type(uint48).max);
        vm.deal(address(this), 100_000);
    }

    function sdk(string memory tokens, uint256 maximum, uint256 fee)
        internal returns (bytes memory commands, bytes[] memory inputs, uint256 value)
    {
        string[] memory args = new string[](11);
        args[0] = "node"; args[1] = vm.envString("SDK_ENCODER"); args[2] = tokens;
        args[3] = vm.toString(bytes32(0)); args[4] = vm.toString(recipient);
        args[5] = vm.toString(maximum); args[6] = "v1"; args[7] = "10000";
        args[8] = "0"; args[9] = vm.toString(fee); args[10] = "10000";
        return abi.decode(vm.ffi(args), (bytes, bytes[], uint256));
    }

    function runSwap(address input, address output, bool expanded, uint256 fee) internal {
        string memory tokens = expanded
            ? string.concat(vm.toString(input), ",", vm.toString(address(0)), ",", vm.toString(output))
            : string.concat(vm.toString(input), ",", vm.toString(output));
        (bytes memory commands, bytes[] memory inputs, uint256 value) = sdk(tokens, 20_000, fee);
        uint256 tokenBefore = a.balanceOf(address(this));
        router.execute{value: value}(commands, inputs, block.timestamp);
        uint256 gross = (10_000 - 1) * 10_000 / (10_000 - fee) + 1;
        uint256 commission = gross * fee / 10_000;
        if (output == address(0)) {
            assertEq(recipient.balance, gross - commission);
            assertEq(address(referral).balance, commission);
        } else {
            assertEq(b.balanceOf(recipient), gross - commission);
            assertEq(b.balanceOf(address(referral)), commission);
        }
        if (input == address(0)) {
            uint256 spent = address(poolB).balance - 1_000_000;
            assertGt(spent, 0); assertLt(spent, value);
            assertEq(recipient.balance, value - spent);
        } else {
            uint256 spent = a.balanceOf(address(poolA)) - 1_000_000;
            assertGt(spent, 0); assertLt(spent, 20_000);
            assertEq(tokenBefore - a.balanceOf(address(this)), spent);
            assertEq(a.allowance(address(router), address(poolA)), 0);
        }
        assertEq(a.balanceOf(address(router)), 0); assertEq(b.balanceOf(address(router)), 0);
        assertEq(address(router).balance, 0); assertEq(safe.balance, 0);
        assertEq(a.balanceOf(safe), 0); assertEq(b.balanceOf(safe), 0);
    }

    function test_sdk_v1NativeInput() public { runSwap(address(0), address(b), false, 0); }
    function test_sdk_v1NativeInputOutputFee() public { runSwap(address(0), address(b), false, 100); }
    function test_sdk_v1NativeOutput() public { runSwap(address(a), address(0), false, 0); }
    function test_sdk_v1NativeOutputFee() public { runSwap(address(a), address(0), false, 100); }
    function test_sdk_v1TokenToToken() public { runSwap(address(a), address(b), false, 0); }
    function test_sdk_v1TokenToTokenFee() public { runSwap(address(a), address(b), false, 100); }
    function test_sdk_v1ExpandedBridge() public { runSwap(address(a), address(b), true, 100); }

    function test_sdk_v1UnconsumedTokenRefund() public {
        SDKV1DiscountExchange exchange = new SDKV1DiscountExchange(a);
        factory.set(address(a), payable(address(exchange)));
        a.mint(address(exchange), 1_000_000); vm.deal(address(exchange), 1_000_000);
        (bytes memory commands, bytes[] memory inputs,) = sdk(
            string.concat(vm.toString(address(a)), ",", vm.toString(address(0))), 20_000, 0);
        router.execute(commands, inputs, block.timestamp);
        assertEq(a.balanceOf(address(this)), 100_000 - 10_132);
        assertEq(a.balanceOf(address(exchange)), 1_000_000 + 10_000);
        assertEq(a.balanceOf(recipient), 132);
        assertEq(recipient.balance, 10_000);
        assertEq(a.balanceOf(address(router)), 0); assertEq(a.balanceOf(safe), 0);
        assertEq(a.allowance(address(router), address(exchange)), 0);
    }

    function test_sdk_v1MaximumReverts() public {
        (bytes memory commands, bytes[] memory inputs,) = sdk(string.concat(vm.toString(address(a)), ",", vm.toString(address(b))), 10_000, 0);
        vm.expectRevert(); router.execute(commands, inputs, block.timestamp);
        assertEq(a.balanceOf(address(this)), 100_000);
        assertEq(b.balanceOf(recipient), 0);
    }
    function test_sdk_v1ShortOutputReverts() public {
        poolB.setShortOutput();
        (bytes memory commands, bytes[] memory inputs,) = sdk(string.concat(vm.toString(address(a)), ",", vm.toString(address(b))), 20_000, 100);
        vm.expectRevert(); router.execute(commands, inputs, block.timestamp);
        assertEq(a.balanceOf(address(this)), 100_000);
        assertEq(b.balanceOf(recipient), 0); assertEq(b.balanceOf(address(referral)), 0);
    }
    receive() external payable {}
}
