// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

/**
 * @title PredictionPool
 * @notice Escrow contract for Prediction Leagues.
 *         Players deposit USDC to join a league; the owner pays out
 *         the whole pool to the winner when the league ends.
 *
 * Deployment (Base mainnet):
 *   USDC address: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
 */

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract PredictionPool {
    // ── State ──────────────────────────────────────────────────────────────

    IERC20 public immutable usdc;
    address public owner;

    struct League {
        uint256 pool;          // total USDC deposited (6 decimals)
        uint96  entryFee;      // per-player entry fee
        bool    paid;          // winner already paid out
        mapping(address => bool) deposited;
    }

    /// leagueId (bytes32 = keccak256 of Supabase UUID string) → League
    mapping(bytes32 => League) private leagues;

    // ── Events ─────────────────────────────────────────────────────────────

    event LeagueCreated(bytes32 indexed leagueId, uint96 entryFee);
    event Deposited(bytes32 indexed leagueId, address indexed player, uint256 amount);
    event Payout(bytes32 indexed leagueId, address indexed winner, uint256 amount);
    event OwnershipTransferred(address indexed prev, address indexed next);

    // ── Errors ─────────────────────────────────────────────────────────────

    error NotOwner();
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

    constructor(address _usdc) {
        usdc  = IERC20(_usdc);
        owner = msg.sender;
    }

    // ── Admin ──────────────────────────────────────────────────────────────

    /**
     * @notice Register a league before any deposits.
     * @param leagueId  keccak256(abi.encodePacked(supabaseUUID))
     * @param entryFee  USDC amount with 6 decimals (e.g. 10 USDC = 10_000_000)
     */
    function createLeague(bytes32 leagueId, uint96 entryFee) external {
        leagues[leagueId].entryFee = entryFee;
        emit LeagueCreated(leagueId, entryFee);
    }

    /**
     * @notice Pay out the entire pool to the winner.
     *         Call this after the backend has determined the winner.
     */
    function payout(bytes32 leagueId, address winner) external onlyOwner {
        League storage league = leagues[leagueId];
        if (league.entryFee == 0)       revert LeagueNotFound();
        if (league.paid)                revert AlreadyPaid();
        if (!league.deposited[winner])  revert NotDepositor();

        uint256 amount = league.pool;
        league.paid    = true;
        league.pool    = 0;

        emit Payout(leagueId, winner, amount);

        if (!usdc.transfer(winner, amount)) revert TransferFailed();
    }

    /**
     * @notice Transfer contract ownership (e.g. to a multisig).
     */
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert NotOwner();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    // ── Player ─────────────────────────────────────────────────────────────

    /**
     * @notice Deposit the entry fee to join a league.
     *         Player must have approved this contract for at least entryFee USDC.
     */
    function deposit(bytes32 leagueId) external {
        League storage league = leagues[leagueId];
        if (league.entryFee == 0)            revert LeagueNotFound();
        if (league.deposited[msg.sender])    revert AlreadyDeposited();

        league.deposited[msg.sender] = true;
        league.pool += league.entryFee;

        emit Deposited(leagueId, msg.sender, league.entryFee);

        if (!usdc.transferFrom(msg.sender, address(this), league.entryFee))
            revert TransferFailed();
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
