"""
DarkShield — Platform Adapters: Base Interface
Defines the standard contract for platform-specific adapters:
Shopify, WooCommerce, Magento, BigCommerce, Generic.
"""

from __future__ import annotations
from abc import ABC, abstractmethod
from typing import Optional
from schemas import PlatformType, PriceCandidate


class BasePlatformAdapter(ABC):
    platform_type: PlatformType = PlatformType.GENERIC

    @abstractmethod
    def detect(self, html: str, url: str) -> bool:
        """Determines if the current page matches this platform's fingerprint."""
        pass

    @abstractmethod
    def extract_candidates(self, html: str, url: str, stage: str = "product") -> list[PriceCandidate]:
        """Extracts platform-specific structured price candidates."""
        pass

    @abstractmethod
    def get_add_to_cart_selectors(self) -> list[str]:
        """Returns prioritized CSS selectors for the platform's Add to Cart CTAs."""
        pass

    @abstractmethod
    def verify_cart_state(self, html: str, url: str, text: str) -> tuple[bool, float, Optional[float]]:
        """
        Validates whether cart state has been reached.
        Returns: (is_confirmed, confidence_score, observed_subtotal)
        """
        pass

    @abstractmethod
    def get_checkout_selectors(self) -> list[str]:
        """Returns prioritized CSS selectors for the platform's Proceed to Checkout CTAs."""
        pass

    @abstractmethod
    def verify_checkout_state(self, html: str, url: str, text: str) -> tuple[bool, float, Optional[float]]:
        """
        Validates whether checkout review state has been reached.
        Returns: (is_confirmed, confidence_score, observed_total)
        """
        pass
