import { useState, useEffect } from "react";
import { ProductInfo, ProductsResponse, ProductType } from "../types/Base";
import { getProductsResult } from "../services/ApiService";
import { getUrlSearchArg } from "../common/utils";

export const useProducts = () => {
  const [products, setProducts] = useState<ProductInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'fixed' | 'generic'>('fixed');

  const getInitialMode = (): 'fixed' | 'generic' => {
    const urlMode = getUrlSearchArg("productmode");
    const storedMode = localStorage.getItem("gcai-product-mode");

    if (urlMode === "fixed" || storedMode === "fixed") {
      return "fixed";
    }
    return "generic"; // 默认为generic
  };

  const getInitialProduct = (productList: ProductInfo[]): string => {
    const urlProduct = getUrlSearchArg("product");
    const storedProduct = localStorage.getItem("gcai-product");

    // 如果URL或存储中指定了具体产品且存在于列表中，使用该产品
    if (urlProduct && productList.some(p => p.id === urlProduct)) {
      return urlProduct;
    }

    if (storedProduct && productList.some(p => p.id === storedProduct)) {
      return storedProduct;
    }

    // 默认选择"generic"（通用）
    return "generic";
  };

  const [selectedProduct, setSelectedProduct] = useState<string>("generic");

  const loadProducts = async (productMode: 'fixed' | 'generic') => {
    try {
      setLoading(true);
      const response: ProductsResponse = await getProductsResult(productMode);
      setProducts(response.products);
      setMode(response.mode);

      const initialProduct = getInitialProduct(response.products);
      setSelectedProduct(initialProduct);

    } catch (error) {
      console.error("Failed to load products:", error);
      const fallbackProducts: ProductInfo[] = [
        { id: ProductType.Forguncy, name: "Forguncy", display_name: "ProductName.Forguncy", type: "fixed" },
        { id: ProductType.Wyn, name: "Wyn", display_name: "ProductName.Wyn", type: "fixed" },
        { id: ProductType.SpreadJS, name: "SpreadJS", display_name: "ProductName.SpreadJS", type: "fixed" },
        { id: ProductType.GcExcel, name: "GcExcel", display_name: "ProductName.GcExcel", type: "fixed" }
      ];
      setProducts(fallbackProducts);
      setMode('generic'); // 默认为generic模式
      setSelectedProduct("generic"); // 默认选择通用
    } finally {
      setLoading(false);
    }
  };

  const switchMode = async (newMode: 'fixed' | 'generic') => {
    if (newMode !== mode) {
      localStorage.setItem("gcai-product-mode", newMode);
      await loadProducts(newMode);
    }
  };

  const selectProduct = (productId: string) => {
    setSelectedProduct(productId);
    localStorage.setItem("gcai-product", productId);
  };

  useEffect(() => {
    const initialMode = getInitialMode();
    loadProducts(initialMode);
  }, []);

  return {
    products,
    loading,
    mode,
    selectedProduct,
    switchMode,
    selectProduct,
    loadProducts
  };
}; 