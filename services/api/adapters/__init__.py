"""
DarkShield — Platform Adapters Registry
Automatically selects the most accurate platform adapter based on page fingerprinting.
"""

from __future__ import annotations
from schemas import PlatformType
from .base import BasePlatformAdapter
from .shopify import ShopifyAdapter
from .woocommerce import WooCommerceAdapter
from .magento import MagentoAdapter
from .bigcommerce import BigCommerceAdapter
from .generic import GenericAdapter

ADAPTERS: list[BasePlatformAdapter] = [
    ShopifyAdapter(),
    WooCommerceAdapter(),
    MagentoAdapter(),
    BigCommerceAdapter(),
    GenericAdapter(), # Universal fallback must be last
]


def resolve_platform_adapter(html: str, url: str) -> BasePlatformAdapter:
    for adapter in ADAPTERS:
        if adapter.detect(html, url):
            return adapter
    return ADAPTERS[-1] # Fallback Generic


__all__ = [
    "BasePlatformAdapter",
    "ShopifyAdapter",
    "WooCommerceAdapter",
    "MagentoAdapter",
    "BigCommerceAdapter",
    "GenericAdapter",
    "resolve_platform_adapter",
]
