"""
DarkShield — Crawler: Purchase Journey State Machine
Enforces the mandatory architectural invariant:
Action -> Observe -> Verify State -> Capture Price -> Commit State.
Never infer state from action intent alone.
"""

from __future__ import annotations
from enum import Enum
from typing import Optional
from pydantic import BaseModel


class PurchaseJourneyState(str, Enum):
    INITIALIZED = "INITIALIZED"
    PRODUCT_DISCOVERED = "PRODUCT_DISCOVERED"
    PRODUCT_CAPTURED = "PRODUCT_CAPTURED"
    ADD_TO_CART_CANDIDATE = "ADD_TO_CART_CANDIDATE"
    ACTION_EXECUTED = "ACTION_EXECUTED"
    CART_STATE_VERIFICATION = "CART_STATE_VERIFICATION"
    CART_CAPTURED = "CART_CAPTURED"
    CHECKOUT_CANDIDATE = "CHECKOUT_CANDIDATE"
    CHECKOUT_ACTION_EXECUTED = "CHECKOUT_ACTION_EXECUTED"
    CHECKOUT_STATE_VERIFICATION = "CHECKOUT_STATE_VERIFICATION"
    CHECKOUT_CAPTURED = "CHECKOUT_CAPTURED"
    TERMINATED_POLICY = "TERMINATED_POLICY"
    FAILED_INCONCLUSIVE = "FAILED_INCONCLUSIVE"


class StateTransitionRecord(BaseModel):
    from_state: PurchaseJourneyState
    to_state: PurchaseJourneyState
    stage: str
    verified: bool
    price_observed: Optional[float] = None
    action_executed: Optional[str] = None
    reason: str


class PurchaseStateMachine:
    def __init__(self):
        self.current_state: PurchaseJourneyState = PurchaseJourneyState.INITIALIZED
        self.history: list[StateTransitionRecord] = []
        self.product_reached: bool = False
        self.cart_reached: bool = False
        self.checkout_reached: bool = False

        self.p0: Optional[float] = None
        self.p1: Optional[float] = None
        self.p2: Optional[float] = None

    def transition_to(
        self,
        new_state: PurchaseJourneyState,
        stage: str,
        verified: bool,
        price_observed: Optional[float] = None,
        action_executed: Optional[str] = None,
        reason: str = ""
    ) -> None:
        rec = StateTransitionRecord(
            from_state=self.current_state,
            to_state=new_state,
            stage=stage,
            verified=verified,
            price_observed=price_observed,
            action_executed=action_executed,
            reason=reason
        )
        self.history.append(rec)
        self.current_state = new_state

        if new_state == PurchaseJourneyState.PRODUCT_CAPTURED and verified:
            self.product_reached = True
            self.p0 = price_observed

        elif new_state == PurchaseJourneyState.CART_CAPTURED and verified:
            self.cart_reached = True
            self.p1 = price_observed

        elif new_state == PurchaseJourneyState.CHECKOUT_CAPTURED and verified:
            self.checkout_reached = True
            self.p2 = price_observed

        elif new_state == PurchaseJourneyState.FAILED_INCONCLUSIVE:
            # Enforce strict invariant: failure cannot leave phantom prices
            if stage == "checkout":
                self.checkout_reached = False
                self.p2 = None
            elif stage == "cart":
                self.cart_reached = False
                self.p1 = None
                self.checkout_reached = False
                self.p2 = None
