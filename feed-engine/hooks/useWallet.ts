import { useState, useCallback, useEffect } from 'react';

/**
 * 钱包集成 Hook — 提供 MetaMask/WalletConnect 连接
 * 使用浏览器原生 window.ethereum (EIP-1193)
 * 
 * 功能:
 * - connectWallet() → 连接 MetaMask
 * - disconnectWallet() → 断开
 * - signMessage() → 签名消息
 * - address / chainId / isConnected 状态
 */

interface WalletState {
    address: string | null;
    chainId: number | null;
    isConnected: boolean;
    isConnecting: boolean;
    error: string | null;
}

/** BSC 链配置 */
const BSC_CHAIN_ID = 56;
const BSC_TESTNET_CHAIN_ID = 97;
const SUPPORTED_CHAIN_IDS = [BSC_CHAIN_ID, BSC_TESTNET_CHAIN_ID];

/**
 * 钱包连接 Hook
 * @returns 钱包状态 + 操作函数
 */
export function useWallet() {
    const [state, setState] = useState<WalletState>({
        address: null,
        chainId: null,
        isConnected: false,
        isConnecting: false,
        error: null,
    });

    /**
     * 检查 MetaMask 是否已安装
     */
    const hasEthereum = typeof window !== 'undefined' && !!(window as any).ethereum;

    /**
     * 连接钱包
     */
    const connectWallet = useCallback(async () => {
        if (!hasEthereum) {
            setState(prev => ({
                ...prev,
                error: '请安装 MetaMask 钱包',
            }));
            return;
        }

        setState(prev => ({ ...prev, isConnecting: true, error: null }));

        try {
            const ethereum = (window as any).ethereum;

            // 请求账户授权
            const accounts: string[] = await ethereum.request({
                method: 'eth_requestAccounts',
            });

            const chainIdHex: string = await ethereum.request({
                method: 'eth_chainId',
            });
            const chainId = parseInt(chainIdHex, 16);

            if (accounts.length > 0) {
                const address = accounts[0].toLowerCase();

                // 持久化到 localStorage
                localStorage.setItem('feed-engine-wallet', address);

                setState({
                    address,
                    chainId,
                    isConnected: true,
                    isConnecting: false,
                    error: null,
                });

                // 检查链 ID
                if (!SUPPORTED_CHAIN_IDS.includes(chainId)) {
                    console.warn(`⚠️ 当前链 ${chainId} 不是 BSC，请切换到 BSC Mainnet 或 Testnet`);
                }
            }
        } catch (error: any) {
            setState(prev => ({
                ...prev,
                isConnecting: false,
                error: error.message || '连接钱包失败',
            }));
        }
    }, [hasEthereum]);

    /**
     * 断开钱包
     */
    const disconnectWallet = useCallback(() => {
        localStorage.removeItem('feed-engine-wallet');
        setState({
            address: null,
            chainId: null,
            isConnected: false,
            isConnecting: false,
            error: null,
        });
    }, []);

    /**
     * 签名消息（用于身份验证）
     */
    const signMessage = useCallback(async (message: string): Promise<string | null> => {
        if (!hasEthereum || !state.address) return null;

        try {
            const ethereum = (window as any).ethereum;
            const signature: string = await ethereum.request({
                method: 'personal_sign',
                params: [message, state.address],
            });
            return signature;
        } catch (error: any) {
            console.error('签名失败:', error);
            setState(prev => ({
                ...prev,
                error: error.message || '签名失败',
            }));
            return null;
        }
    }, [hasEthereum, state.address]);

    /**
     * 切换到 BSC 链
     */
    const switchToBSC = useCallback(async (testnet = false) => {
        if (!hasEthereum) return;

        const targetChainId = testnet ? BSC_TESTNET_CHAIN_ID : BSC_CHAIN_ID;
        const ethereum = (window as any).ethereum;

        try {
            await ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: `0x${targetChainId.toString(16)}` }],
            });
        } catch (switchError: any) {
            // 如果链未添加，尝试添加
            if (switchError.code === 4902) {
                try {
                    await ethereum.request({
                        method: 'wallet_addEthereumChain',
                        params: [{
                            chainId: `0x${targetChainId.toString(16)}`,
                            chainName: testnet ? 'BSC Testnet' : 'BNB Smart Chain',
                            nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
                            rpcUrls: testnet
                                ? ['https://bsc-testnet-rpc.publicnode.com']
                                : ['https://bsc-dataseed1.binance.org'],
                            blockExplorerUrls: testnet
                                ? ['https://testnet.bscscan.com']
                                : ['https://bscscan.com'],
                        }],
                    });
                } catch (addError) {
                    console.error('添加 BSC 链失败:', addError);
                }
            }
        }
    }, [hasEthereum]);

    /**
     * 计算 keccak256 哈希（用于 Commit-Reveal）
     * @param price 价格
     * @param salt 盐值
     * @returns 哈希字符串
     */
    const computePriceHash = useCallback((price: number, salt: string): string => {
        // 使用 Web Crypto API 计算哈希
        // 这里简化为模拟; 生产中应使用 ethers.js 的 keccak256
        const priceWei = BigInt(Math.round(price * 1e18));
        const message = `${priceWei.toString()}:${salt}`;
        // 简单哈希（前端可替换为 ethers.keccak256）
        let hash = 0;
        for (let i = 0; i < message.length; i++) {
            const char = message.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash |= 0;
        }
        return `0x${Math.abs(hash).toString(16).padStart(64, '0')}`;
    }, []);

    /**
     * 监听账户和链变化
     */
    useEffect(() => {
        if (!hasEthereum) return;

        const ethereum = (window as any).ethereum;

        const handleAccountsChanged = (accounts: string[]) => {
            if (accounts.length === 0) {
                disconnectWallet();
            } else {
                setState(prev => ({
                    ...prev,
                    address: accounts[0].toLowerCase(),
                }));
            }
        };

        const handleChainChanged = (chainIdHex: string) => {
            setState(prev => ({
                ...prev,
                chainId: parseInt(chainIdHex, 16),
            }));
        };

        ethereum.on('accountsChanged', handleAccountsChanged);
        ethereum.on('chainChanged', handleChainChanged);

        // 自动恢复之前的连接
        const savedAddress = localStorage.getItem('feed-engine-wallet');
        if (savedAddress) {
            ethereum.request({ method: 'eth_accounts' }).then((accounts: string[]) => {
                if (accounts.length > 0 && accounts[0].toLowerCase() === savedAddress) {
                    connectWallet();
                } else {
                    localStorage.removeItem('feed-engine-wallet');
                }
            }).catch(() => { });
        }

        return () => {
            ethereum.removeListener('accountsChanged', handleAccountsChanged);
            ethereum.removeListener('chainChanged', handleChainChanged);
        };
    }, [hasEthereum, connectWallet, disconnectWallet]);

    return {
        ...state,
        hasEthereum,
        connectWallet,
        disconnectWallet,
        signMessage,
        switchToBSC,
        computePriceHash,
        isBSC: state.chainId !== null && SUPPORTED_CHAIN_IDS.includes(state.chainId),
    };
}
