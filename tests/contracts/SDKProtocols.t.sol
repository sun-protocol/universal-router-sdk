// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {MockERC20} from "solmate/src/test/utils/mocks/MockERC20.sol";
import {WETH} from "solmate/src/tokens/WETH.sol";
import {DeployPermit2} from "permit2/test/utils/DeployPermit2.sol";
import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";
import {UniversalRouter} from "src/UniversalRouter.sol";
import {RouterParameters} from "src/base/RouterImmutables.sol";
import {UniversalRouterHelper} from "src/libraries/UniversalRouterHelper.sol";
import {ReferralVault} from "src/ReferralVault.sol";

interface Callback {
    function uniswapV3SwapCallback(int256 a, int256 b, bytes calldata data) external;
}

// Controlled pools exercise the real Router payment and swap modules.
// V4 tests separately use the actual PoolManager and liquidity implementation.
contract SDKPool {
    MockERC20 public token0;
    MockERC20 public token1;
    bool public shortOutput;
    function initialize(address a, address b) external { token0 = MockERC20(a); token1 = MockERC20(b); }
    function setShortOutput() external { shortOutput = true; }
    function getReserves() external pure returns (uint112, uint112, uint32) { return (100 ether, 100 ether, 0); }
    function swap(uint256 a, uint256 b, address recipient, bytes calldata) external {
        if (shortOutput) { a /= 2; b /= 2; }
        if (a != 0) token0.transfer(recipient, a);
        if (b != 0) token1.transfer(recipient, b);
    }
    function swap(address recipient, bool zeroForOne, int256 specified, uint160, bytes calldata data)
        external returns (int256 a, int256 b)
    {
        require(specified < 0);
        uint256 output = uint256(-specified);
        uint256 input = output + output / 100;
        MockERC20 inputToken = zeroForOne ? token0 : token1;
        MockERC20 outputToken = zeroForOne ? token1 : token0;
        uint256 beforeBalance = inputToken.balanceOf(address(this));
        if (shortOutput) output /= 2;
        outputToken.transfer(recipient, output);
        (a, b) = zeroForOne ? (int256(input), -int256(output)) : (-int256(output), int256(input));
        Callback(msg.sender).uniswapV3SwapCallback(a, b, data);
        require(inputToken.balanceOf(address(this)) >= beforeBalance + input, "unpaid callback");
    }

}

contract SDKPsm {
    address public constant usdd = 0xE91A7411e56Ce79E83570570f49B9FC35B7727c5;
    address constant gem = 0xa614f803B6FD780986A42c78Ec9c7f77e6DeD13C;
    function gemJoin() external view returns (address) { return address(this); }
    function sellGem(address recipient, uint256 amount) external {
        MockERC20(gem).transferFrom(msg.sender, address(this), amount);
        MockERC20(usdd).transfer(recipient, amount * 1e12);
    }
    function buyGem(address recipient, uint256 amount) external {
        MockERC20(usdd).transferFrom(msg.sender, address(this), amount * 1e12);
        MockERC20(gem).transfer(recipient, amount);
    }
}

contract SDKProtocolsTest is Test, DeployPermit2 {
    UniversalRouter router;
    IAllowanceTransfer permit2;
    ReferralVault referral;
    SDKPsm psm;
    address alice = address(0x1000);
    address recipient = address(0x2000);
    address safe = address(0x3000);
    address a = address(0x100000);
    address b = address(0x200000);
    address c = address(0x300000);
    bytes32 constant HASH = bytes32(uint256(123));
    address constant WRAPPED = 0x891cdb91d149f23B1a45D9c5Ca78a88d0cB44C18;

    function getStableInfo(address, address, uint256) external view returns (uint256, uint256, address, uint256) {
        return (0, 1, address(psm), 1e12);
    }

    function setUp() public {
        permit2 = IAllowanceTransfer(deployPermit2());
        RouterParameters memory params;
        params.permit2 = address(permit2);
        vm.etch(WRAPPED, address(new WETH()).code);
        vm.deal(WRAPPED, 1000 ether);
        params.weth9 = WRAPPED;
        params.v2Factory = address(this);
        params.v3Deployer = address(this);
        params.v2InitCodeHash = HASH;
        params.v3InitCodeHash = HASH;
        params.stableFactory = address(this);
        params.safeVault = safe;
        router = new UniversalRouter(params);
        referral = new ReferralVault(address(this), address(router));
        referral.setMaxReferralBips(1000);
        router.setReferralVault(address(referral));
        psm = new SDKPsm();
        token(a); token(b); token(c);
        token(0xa614f803B6FD780986A42c78Ec9c7f77e6DeD13C);
        token(psm.usdd());
        MockERC20(0xa614f803B6FD780986A42c78Ec9c7f77e6DeD13C).mint(address(psm), 100 ether);
        MockERC20(psm.usdd()).mint(address(psm), 100 ether);
    }

    function token(address t) internal {
        vm.etch(t, address(new MockERC20("token", "T", 18)).code);
        MockERC20(t).mint(alice, 10 ether);
        vm.startPrank(alice);
        MockERC20(t).approve(address(permit2), type(uint256).max);
        permit2.approve(t, address(router), type(uint160).max, type(uint48).max);
        vm.stopPrank();
    }

    function pool(address x, address y, bool v3) internal returns (SDKPool result) {
        address at = v3 ? UniversalRouterHelper.computePoolAddress(address(this), HASH, x, y, 3000)
            : UniversalRouterHelper.pairFor(address(this), HASH, x, y);
        vm.etch(at, address(new SDKPool()).code);
        result = SDKPool(payable(at));
        result.initialize(x < y ? x : y, x < y ? y : x);
        if (x == WRAPPED) deal(x, at, 100 ether); else MockERC20(x).mint(at, 100 ether);
        if (y == WRAPPED) deal(y, at, 100 ether); else MockERC20(y).mint(at, 100 ether);
    }

    function sdk(string memory tokens, string memory protocol, uint256 inputBips, uint256 outputBips,
        uint256 target, uint256 routing) internal returns (bytes memory commands, bytes[] memory inputs, uint256 value)
    {
        string[] memory args = new string[](11);
        args[0] = "node"; args[1] = vm.envString("SDK_ENCODER"); args[2] = tokens;
        args[3] = vm.toString(bytes32(0)); args[4] = vm.toString(recipient);
        args[5] = vm.toString(uint256(2 ether)); args[6] = protocol;
        args[7] = vm.toString(target); args[8] = vm.toString(inputBips);
        args[9] = vm.toString(outputBips); args[10] = vm.toString(routing);
        return abi.decode(vm.ffi(args), (bytes, bytes[], uint256));
    }

    function test_sdk_v2OutputReferralAndActualInput() public {
        address pair = address(pool(a, b, false));
        (bytes memory commands, bytes[] memory inputs,) = sdk(string.concat(vm.toString(a), ",", vm.toString(b)), "v2", 0, 100, 1 ether, 1 ether);
        uint256 userBefore = MockERC20(a).balanceOf(alice);
        vm.prank(alice); router.execute(commands, inputs, block.timestamp);
        uint256 gross = 100 ether - MockERC20(b).balanceOf(pair);
        uint256 fee = gross / 100;
        assertEq(MockERC20(b).balanceOf(address(referral)), fee);
        assertEq(MockERC20(a).balanceOf(address(referral)), 0);
        assertGt(referral.referralBalance(b, recipient), 0);
        assertEq(MockERC20(a).balanceOf(recipient), 0); // unused budget was never pulled
        assertLt(userBefore - MockERC20(a).balanceOf(alice), 2 ether);
        assertGe(MockERC20(b).balanceOf(recipient), 1 ether);
        assertEq(MockERC20(a).balanceOf(address(router)), 0);
        assertEq(MockERC20(a).balanceOf(safe), 0);
        uint256 poolInput = MockERC20(a).balanceOf(pair) - 100 ether;
        assertGt(poolInput, 0);
        assertEq(userBefore - MockERC20(a).balanceOf(alice), poolInput);
        assertEq(gross, MockERC20(b).balanceOf(recipient) + fee);
    }

    function test_sdk_v2MultihopOutputReferral() public {
        address firstPair = address(pool(a, b, false));
        address secondPair = address(pool(b, c, false));
        (bytes memory commands, bytes[] memory inputs,) = sdk(string.concat(vm.toString(a), ",", vm.toString(b), ",", vm.toString(c)), "v2", 0, 100, 1 ether, 1 ether);
        vm.prank(alice); router.execute(commands, inputs, block.timestamp);
        assertGe(MockERC20(c).balanceOf(recipient), 1 ether);
        assertGt(MockERC20(c).balanceOf(address(referral)), 0);
        assertGt(MockERC20(a).balanceOf(alice), 8 ether);
        uint256 paid = 10 ether - MockERC20(a).balanceOf(alice);
        assertGt(paid, 0);
        assertEq(MockERC20(a).balanceOf(firstPair) - 100 ether, paid);
        uint256 intermediate = 100 ether - MockERC20(b).balanceOf(firstPair);
        assertGt(intermediate, 0);
        assertEq(MockERC20(b).balanceOf(secondPair) - 100 ether, intermediate);
        assertEq(100 ether - MockERC20(c).balanceOf(secondPair),
            MockERC20(c).balanceOf(recipient) + MockERC20(c).balanceOf(address(referral)));
        assertEq(MockERC20(a).balanceOf(address(router)), 0);
        assertEq(MockERC20(b).balanceOf(address(router)), 0);
        assertEq(MockERC20(c).balanceOf(address(router)), 0);
    }

    function test_sdk_v2ShortOutputRollsBack() public {
        SDKPool pair = pool(a, b, false);
        pair.setShortOutput();
        (bytes memory commands, bytes[] memory inputs,) = sdk(string.concat(vm.toString(a), ",", vm.toString(b)), "v2", 0, 0, 1 ether, 1 ether);
        vm.expectRevert(); vm.prank(alice); router.execute(commands, inputs, block.timestamp);
        assertEq(MockERC20(a).balanceOf(alice), 10 ether);
        assertEq(MockERC20(b).balanceOf(recipient), 0);
        assertEq(MockERC20(a).balanceOf(address(pair)), 100 ether);
        assertEq(MockERC20(b).balanceOf(address(pair)), 100 ether);
    }

    function test_sdk_v3MultihopCallbackPayment() public {
        pool(a, b, true); pool(b, c, true);
        (bytes memory commands, bytes[] memory inputs,) = sdk(string.concat(vm.toString(a), ",", vm.toString(b), ",", vm.toString(c)), "v3", 0, 0, 1 ether, 1 ether);
        vm.prank(alice); router.execute(commands, inputs, block.timestamp);
        assertEq(MockERC20(c).balanceOf(recipient), 1 ether);
        assertEq(MockERC20(a).balanceOf(alice), 10 ether - 1.0201 ether);
        assertEq(MockERC20(b).balanceOf(address(router)), 0);
    }

    function test_sdk_v3UserPaidLoopSeparatesPaymentAndOutput() public {
        pool(a, b, true); pool(b, c, true); pool(c, a, true);
        (bytes memory commands, bytes[] memory inputs,) = sdk(string.concat(vm.toString(a), ",", vm.toString(b), ",", vm.toString(c), ",", vm.toString(a)), "v3", 0, 0, 1 ether, 1 ether);
        vm.prank(alice); router.execute(commands, inputs, block.timestamp);
        assertEq(MockERC20(a).balanceOf(recipient), 1 ether);
        assertEq(MockERC20(a).balanceOf(alice), 10 ether - 1.030301 ether);
        assertEq(MockERC20(a).balanceOf(address(router)), 0);
    }

    function test_sdk_wrapAndRefundInNativeCurrency() public {
        pool(WRAPPED, b, false);
        (bytes memory commands, bytes[] memory inputs, uint256 value) = sdk(string.concat(
            vm.toString(address(0)), ",", vm.toString(WRAPPED), ",", vm.toString(b)), "v2", 0, 0, 1 ether, 1 ether);
        vm.deal(alice, value);
        vm.prank(alice); router.execute{value: value}(commands, inputs, block.timestamp);
        assertGe(MockERC20(b).balanceOf(recipient), 1 ether);
        assertGt(recipient.balance, 0);
        assertLt(recipient.balance, value);
        assertEq(WRAPPED.balance, 1000 ether + value - recipient.balance);
        assertEq(WETH(payable(WRAPPED)).balanceOf(address(router)), 0);
        assertEq(address(router).balance, 0);
        assertEq(safe.balance, 0);
    }

    function test_sdk_outputUnwrap() public {
        pool(a, WRAPPED, false);
        (bytes memory commands, bytes[] memory inputs,) = sdk(string.concat(
            vm.toString(a), ",", vm.toString(WRAPPED), ",", vm.toString(address(0))), "v2", 0, 0, 1 ether, 1 ether);
        vm.prank(alice); router.execute(commands, inputs, block.timestamp);
        assertGe(recipient.balance, 1 ether);
        assertEq(WETH(payable(WRAPPED)).balanceOf(address(router)), 0);
        assertEq(address(router).balance, 0);
    }

    function test_sdk_pureWrapAndUnwrap() public {
        for (uint256 mode; mode < 2; mode++) {
            uint256 outputBips = mode == 1 ? 100 : 0;
            uint256 gross = outputBips == 0 ? 1 ether : (uint256(1 ether) - 1) * 10000 / 9900 + 1;
            uint256 nativeBefore = recipient.balance;
            uint256 wrappedBefore = WETH(payable(WRAPPED)).balanceOf(recipient);
            (bytes memory commands, bytes[] memory inputs, uint256 value) = sdk(string.concat(
                vm.toString(address(0)), ",", vm.toString(WRAPPED)), "v2", 0, outputBips, 1 ether, gross);
            vm.deal(alice, value);
            vm.prank(alice); router.execute{value: value}(commands, inputs, block.timestamp);
            assertEq(WETH(payable(WRAPPED)).balanceOf(recipient) - wrappedBefore, 1 ether);
            assertEq(recipient.balance - nativeBefore, value - gross);

            uint256 total = gross;
            deal(WRAPPED, alice, total);
            vm.startPrank(alice);
            WETH(payable(WRAPPED)).approve(address(permit2), total);
            permit2.approve(WRAPPED, address(router), uint160(total), type(uint48).max);
            vm.stopPrank();
            nativeBefore = recipient.balance;
            (commands, inputs, value) = sdk(string.concat(vm.toString(WRAPPED), ",", vm.toString(address(0))),
                "v2", 0, outputBips, 1 ether, gross);
            assertEq(value, 0);
            vm.prank(alice); router.execute(commands, inputs, block.timestamp);
            assertEq(recipient.balance - nativeBefore, 1 ether);
            assertEq(WETH(payable(WRAPPED)).balanceOf(alice), 0);
            assertEq(WETH(payable(WRAPPED)).balanceOf(address(router)), 0);
            assertEq(address(router).balance, 0);
        }
    }

    function test_sdk_psmBothDirections() public {
        address gem = 0xa614f803B6FD780986A42c78Ec9c7f77e6DeD13C;
        address usdd = psm.usdd();
        (bytes memory commands, bytes[] memory inputs,) = sdk(string.concat(vm.toString(gem), ",", vm.toString(usdd)), "usdt20psm", 0, 0, 1 ether, 1e6);
        vm.prank(alice); router.execute(commands, inputs, block.timestamp);
        assertEq(MockERC20(usdd).balanceOf(recipient), 1 ether);
        assertEq(MockERC20(gem).balanceOf(alice), 10 ether - 1e6);
        (commands, inputs,) = sdk(string.concat(vm.toString(usdd), ",", vm.toString(gem)), "usdt20psm", 0, 0, 1e6, 1 ether);
        vm.prank(alice); router.execute(commands, inputs, block.timestamp);
        assertEq(MockERC20(gem).balanceOf(recipient), 1e6);
        assertEq(MockERC20(usdd).balanceOf(alice), 9 ether);
    }
}
