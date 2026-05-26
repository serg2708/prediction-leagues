// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

/**
 * @title PredictionPoolFee
 * @notice Escrow for Prediction Leagues. 5% platform fee collected at deposit
 *         so the pool always reflects the exact prize. Winner receives full pool.
 *
 * Deployment (Base mainnet):
 *   USDC address:   0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
 *   feeRecipient:   your wallet / multisig
 */

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract PredictionPoolFee {
    // ── Constants ──────────────────────────────────────────────────────────

    uint256 public constant FEE_BPS = 500; // 5%

    // ── State ──────────────────────────────────────────────────────────────

    IERC20  public immutable usdc;
    address public owner;
    address public feeRecipient;

    struct League {
        uint256 pool;
        uint96  entryFee;
        bool    paid;
        mapping(address => bool) deposited;
    }

    mapping(bytes32 => League) private leagues;

    // ── Events ─────────────────────────────────────────────────────────────

    event LeagueCreated(bytes32 indexed leagueId, uint96 entryFee);
    event Deposited(bytes32 indexed leagueId, address indexed player, uint256 poolAmount, uint256 fee);
    event Payout(bytes32 indexed leagueId, address indexed winner, uint256 amount);
    event PayoutMultiple(bytes32 indexed leagueId, address[] winners, uint256 shareEach);
    event OwnershipTransferred(address indexed prev, address indexed next);
    event FeeRecipientUpdated(address indexed prev, address indexed next);

    // ── Errors ─────────────────────────────────────────────────────────────

    error NotOwner();
    error ZeroAddress();
    error EmptyWinners();
    error LeagueNotFound();
    error AlreadyDeposited();
    error AlreadyPaid();
    error TransferFailed();
    error NotDepositor();

    // ── Modifiers ──────────────────────────────────────────────────────────

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    // ── Constructor ────────────────────────────────────────────────────────

    constructor(address _usdc, address _feeRecipient) {
        if (_usdc == address(0) || _feeRecipient == address(0)) revert ZeroAddress();
        usdc         = IERC20(_usdc);
        owner        = msg.sender;
        feeRecipient = _feeRecipient;
    }

    // ── Admin ──────────────────────────────────────────────────────────────

    function createLeague(bytes32 leagueId, uint96 entryFee) external onlyOwner {
        leagues[leagueId].entryFee = entryFee;
        emit LeagueCreated(leagueId, entryFee);
    }

    /**
     * @notice Pay full pool to winner. Fee was already collected at deposit.
     */
    function payout(bytes32 leagueId, address winner) external onlyOwner {
        if (winner == address(0)) revert ZeroAddress();
        League storage league = leagues[leagueId];
        if (league.entryFee == 0)      revert LeagueNotFound();
        if (league.paid)               revert AlreadyPaid();
        if (!league.deposited[winner]) revert NotDepositor();

        uint256 amount = league.pool;
        league.paid  = true;
        league.pool  = 0;

        emit Payout(leagueId, winner, amount);

        if (!usdc.transfer(winner, amount)) revert TransferFailed();
    }

    /**
     * @notice Split pool equally among tied winners. Remainder (dust) goes to the last winner.
     */
    function payoutMultiple(bytes32 leagueId, address[] calldata winners) external onlyOwner {
        if (winners.length == 0) revert EmptyWinners();
        League storage league = leagues[leagueId];
        if (league.entryFee == 0) revert LeagueNotFound();
        if (league.paid)          revert AlreadyPaid();

        for (uint256 i = 0; i < winners.length; i++) {
            if (winners[i] == address(0))        revert ZeroAddress();
            if (!league.deposited[winners[i]])   revert NotDepositor();
        }

        uint256 total     = league.pool;
        uint256 share     = total / winners.length;
        uint256 remainder = total - share * winners.length;

        league.paid = true;
        league.pool = 0;

        emit PayoutMultiple(leagueId, winners, share);

        for (uint256 i = 0; i < winners.length; i++) {
            uint256 amount = (i == winners.length - 1) ? share + remainder : share;
            if (!usdc.transfer(winners[i], amount)) revert TransferFailed();
        }
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function setFeeRecipient(address newRecipient) external onlyOwner {
        if (newRecipient == address(0)) revert ZeroAddress();
        emit FeeRecipientUpdated(feeRecipient, newRecipient);
        feeRecipient = newRecipient;
    }

    // ── Player ─────────────────────────────────────────────────────────────

    /**
     * @notice Deposit entry fee + 5% platform fee.
     *         User must approve this contract for entryFee * 10_500 / 10_000.
     *         Fee is forwarded to feeRecipient immediately; entryFee goes to pool.
     */
    function deposit(bytes32 leagueId) external {
        League storage league = leagues[leagueId];
        if (league.entryFee == 0)        revert LeagueNotFound();
        if (league.deposited[msg.sender]) revert AlreadyDeposited();

        uint256 fee   = uint256(league.entryFee) * FEE_BPS / 10_000;
        uint256 total = uint256(league.entryFee) + fee;

        league.deposited[msg.sender] = true;
        league.pool += league.entryFee;

        emit Deposited(leagueId, msg.sender, league.entryFee, fee);

        // Pull total from user, forward fee immediately
        if (!usdc.transferFrom(msg.sender, address(this), total)) revert TransferFailed();
        if (!usdc.transfer(feeRecipient, fee))                    revert TransferFailed();
    }

    // ── Views ──────────────────────────────────────────────────────────────

    function getPool(bytes32 leagueId) external view returns (uint256) {
        return leagues[leagueId].pool;
    }

    function getEntryFee(bytes32 leagueId) external view returns (uint96) {
        return leagues[leagueId].entryFee;
    }

    function hasDeposited(bytes32 leagueId, address player) external view returns (bool) {
        return leagues[leagueId].deposited[player];
    }

    function isPaid(bytes32 leagueId) external view returns (bool) {
        return leagues[leagueId].paid;
    }
}
