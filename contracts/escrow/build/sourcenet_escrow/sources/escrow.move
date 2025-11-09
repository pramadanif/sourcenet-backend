/// Escrow module for SourceNet data marketplace
/// Handles payment escrow between buyers and sellers
module sourcenet::escrow {
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    use sui::sui::SUI;
    use sui::transfer;
    use sui::object::{Self, UID};
    use sui::tx_context::{Self, TxContext};
    use sui::event;
    use std::string::String;

    /// Escrow object holding payment in trust
    public struct Escrow has key, store {
        id: UID,
        purchase_id: String,
        buyer: address,
        seller: address,
        amount: u64,
        data_hash: String,
        status: u8, // 0: pending, 1: released, 2: refunded
        created_at: u64,
        balance: Balance<SUI>, // Store balance for transfer
    }

    /// Escrow owner capability
    public struct EscrowOwnerCap has key {
        id: UID,
        escrow_id: address,
    }

    // Events
    public struct EscrowCreated has copy, drop {
        escrow_id: address,
        purchase_id: String,
        buyer: address,
        seller: address,
        amount: u64,
    }

    public struct EscrowReleased has copy, drop {
        escrow_id: address,
        seller: address,
        amount: u64,
    }

    public struct EscrowRefunded has copy, drop {
        escrow_id: address,
        buyer: address,
        amount: u64,
    }

    // Errors
    const EInvalidStatus: u64 = 1;
    const EUnauthorized: u64 = 2;
    const EInsufficientFunds: u64 = 3;
    const EInvalidAmount: u64 = 4;

    /// Create new escrow
    public fun create_escrow(
        purchase_id: String,
        buyer: address,
        seller: address,
        data_hash: String,
        coin: Coin<SUI>,
        ctx: &mut TxContext,
    ): (Escrow, EscrowOwnerCap) {
        let amount = coin::value(&coin);
        assert!(amount > 0, EInvalidAmount);

        let escrow_id = object::new(ctx);
        let escrow_addr = object::uid_to_address(&escrow_id);

        let balance = coin::into_balance(coin);
        
        let escrow = Escrow {
            id: escrow_id,
            purchase_id: purchase_id,
            buyer: buyer,
            seller: seller,
            amount: amount,
            data_hash: data_hash,
            status: 0, // pending
            created_at: tx_context::epoch(ctx),
            balance: balance, // Store balance in escrow
        };

        let cap = EscrowOwnerCap {
            id: object::new(ctx),
            escrow_id: escrow_addr,
        };

        event::emit(EscrowCreated {
            escrow_id: escrow_addr,
            purchase_id: escrow.purchase_id,
            buyer: buyer,
            seller: seller,
            amount: amount,
        });

        (escrow, cap)
    }

    /// Release escrow to seller
    public fun release_escrow(
        escrow: &mut Escrow,
        seller_address: address,
        ctx: &mut TxContext,
    ) {
        assert!(escrow.status == 0, EInvalidStatus);

        escrow.status = 1; // released

        event::emit(EscrowReleased {
            escrow_id: object::uid_to_address(&escrow.id),
            seller: seller_address,
            amount: escrow.amount,
        });

        // Create coin from balance and transfer to seller
        let coin = coin::from_balance(balance::split(&mut escrow.balance, escrow.amount), ctx);
        transfer::public_transfer(coin, seller_address);
    }

    /// Refund escrow to buyer
    public fun refund_escrow(
        escrow: &mut Escrow,
        buyer_address: address,
        ctx: &mut TxContext,
    ) {
        assert!(escrow.status == 0, EInvalidStatus);

        escrow.status = 2; // refunded

        event::emit(EscrowRefunded {
            escrow_id: object::uid_to_address(&escrow.id),
            buyer: buyer_address,
            amount: escrow.amount,
        });

        // Create coin from balance and transfer to buyer
        let coin = coin::from_balance(balance::split(&mut escrow.balance, escrow.amount), ctx);
        transfer::public_transfer(coin, buyer_address);
    }

    /// Get escrow status
    public fun get_status(escrow: &Escrow): u8 {
        escrow.status
    }

    /// Get escrow amount
    public fun get_amount(escrow: &Escrow): u64 {
        escrow.amount
    }

    /// Get escrow buyer
    public fun get_buyer(escrow: &Escrow): address {
        escrow.buyer
    }

    /// Get escrow seller
    public fun get_seller(escrow: &Escrow): address {
        escrow.seller
    }
}
