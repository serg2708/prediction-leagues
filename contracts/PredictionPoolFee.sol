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
        bool    voided;   // refund in progress / done — payout permanently blocked
        mapping(address => bool) deposited;
    }

    mapping(bytes32 => League) private leagues;

    // ── Events ─────────────────────────────────────────────────────────────

    event LeagueCreated(bytes32 indexed leagueId, uint96 entryFee);
    event Deposited(bytes32 indexed leagueId, address indexed player, uint256 poolAmount, uint256 fee);
    event Payout(bytes32 indexed leagueId, address indexed winner, uint256 amount);
    event PayoutMultiple(bytes32 indexed leagueId, address[] winners, uint256 shareEach);
    event PayoutSplit(bytes32 indexed leagueId, address[] winners, uint16[] sharesBps);
    event Refunded(bytes32 indexed leagueId, address indexed player, uint256 amount);
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
    error BadShares();

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
        if (league.paid || league.voided) revert AlreadyPaid();
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
        if (league.entryFee == 0)         revert LeagueNotFound();
        if (league.paid || league.voided) revert AlreadyPaid();

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

    /**
     * @notice Pay the pool out across multiple winners with explicit shares in
     *         basis points (must sum to exactly 10_000). Generalises payout /
     *         payoutMultiple: winner-take-all is [winner],[10000]; an N-way tie
     *         is equal shares; a podium is e.g. [6000,3000,1000]. Rounding dust
     *         goes to the last winner so the pool is always fully drained.
     */
    function payoutSplit(
        bytes32 leagueId,
        address[] calldata winners,
        uint16[] calldata sharesBps
    ) external onlyOwner {
        if (winners.length == 0)                revert EmptyWinners();
        if (winners.length != sharesBps.length) revert BadShares();
        League storage league = leagues[leagueId];
        if (league.entryFee == 0)         revert LeagueNotFound();
        if (league.paid || league.voided) revert AlreadyPaid();

        uint256 totalBps;
        for (uint256 i = 0; i < winners.length; i++) {
            if (winners[i] == address(0))      revert ZeroAddress();
            if (!league.deposited[winners[i]]) revert NotDepositor();
            totalBps += sharesBps[i];
        }
        if (totalBps != 10_000) revert BadShares();

        uint256 total = league.pool;
        league.paid = true;
        league.pool = 0;

        emit PayoutSplit(leagueId, winners, sharesBps);

        uint256 distributed;
        for (uint256 i = 0; i < winners.length; i++) {
            uint256 amount = (i == winners.length - 1)
                ? total - distributed
                : (total * sharesBps[i]) / 10_000;
            distributed += amount;
            if (amount > 0) {
                if (!usdc.transfer(winners[i], amount)) revert TransferFailed();
            }
        }
    }

    /**
     * @notice Refund depositors of a voided league (e.g. under min players or
     *         dead/off-season). Returns each player's pool contribution
     *         (entryFee). The 5% platform fee taken at deposit is NOT refundable
     *         here — it already left the contract to feeRecipient.
     *
     *         Safe to call in batches: `voided` is set on the first call so
     *         payout can never run, and each player's `deposited` flag is
     *         cleared on refund to prevent double refunds.
     *
     * @param players Addresses to refund (backend supplies the depositor list).
     */
    function refund(bytes32 leagueId, address[] calldata players) external onlyOwner {
        League storage league = leagues[leagueId];
        if (league.entryFee == 0) revert LeagueNotFound();
        if (league.paid)          revert AlreadyPaid();

        league.voided = true;

        for (uint256 i = 0; i < players.length; i++) {
            address p = players[i];
            // Skip non-depositors and anyone already refunded
            if (!league.deposited[p]) continue;
            league.deposited[p] = false;

            uint256 amount = league.entryFee;
            if (amount > league.pool) amount = league.pool; // guard last-cent rounding
            league.pool -= amount;

            emit Refunded(leagueId, p, amount);
            if (amount > 0) {
                if (!usdc.transfer(p, amount)) revert TransferFailed();
            }
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

    function isVoided(bytes32 leagueId) external view returns (bool) {
        return leagues[leagueId].voided;
    }
}
