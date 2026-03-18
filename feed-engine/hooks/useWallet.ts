import { useState, useCallback, useEffect } from 'react';
import { ethers } from 'ethers';

/**
 * 閽卞寘闆嗘垚 Hook 鈥?鎻愪緵 MetaMask/WalletConnect 杩炴帴
 * 浣跨敤娴忚鍣ㄥ師鐢?window.ethereum (EIP-1193)
 * 
 * 鍔熻兘:
 * - connectWallet() 鈫?杩炴帴 MetaMask
 * - disconnectWallet() 鈫?鏂紑
 * - signMessage() 鈫?绛惧悕娑堟伅
 * - address / chainId / isConnected 鐘舵€?
 */

interface WalletState {
    address: string | null;
    chainId: number | null;
    isConnected: boolean;
    isConnecting: boolean;
    error: string | null;
}

/** BSC 閾鹃厤缃?*/
const BSC_CHAIN_ID = 56;
const BSC_TESTNET_CHAIN_ID = 97;
const SUPPORTED_CHAIN_IDS = [BSC_CHAIN_ID, BSC_TESTNET_CHAIN_ID];

/**
 * 閽卞寘杩炴帴 Hook
 * @returns 閽卞寘鐘舵€?+ 鎿嶄綔鍑芥暟
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
     * 妫€鏌?MetaMask 鏄惁宸插畨瑁?
     */
    const hasEthereum = typeof window !== 'undefined' && !!(window as any).ethereum;

    /**
     * 杩炴帴閽卞寘
     */
    const connectWallet = useCallback(async () => {
        if (!hasEthereum) {
            setState(prev => ({
                ...prev,
                error: 'Install MetaMask first',
            }));
            return;
        }

        setState(prev => ({ ...prev, isConnecting: true, error: null }));

        try {
            const ethereum = (window as any).ethereum;

            // 璇锋眰璐︽埛鎺堟潈
            const accounts: string[] = await ethereum.request({
                method: 'eth_requestAccounts',
            });

            const chainIdHex: string = await ethereum.request({
                method: 'eth_chainId',
            });
            const chainId = parseInt(chainIdHex, 16);

            if (accounts.length > 0) {
                const address = accounts[0].toLowerCase();

                // 鎸佷箙鍖栧埌 localStorage
                localStorage.setItem('feed-engine-wallet', address);

                setState({
                    address,
                    chainId,
                    isConnected: true,
                    isConnecting: false,
                    error: null,
                });

                // 妫€鏌ラ摼 ID
                if (!SUPPORTED_CHAIN_IDS.includes(chainId)) {
                    console.warn(`Current chain ${chainId} is not BSC. Switch to BSC Mainnet or Testnet.`);
                }
            }
        } catch (error: any) {
            setState(prev => ({
                ...prev,
                isConnecting: false,
                error: error.message || 'Wallet connection failed',
            }));
        }
    }, [hasEthereum]);

    /**
     * 鏂紑閽卞寘
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
     * 绛惧悕娑堟伅锛堢敤浜庤韩浠介獙璇侊級
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
            console.error('Message signing failed:', error);
            setState(prev => ({
                ...prev,
                error: error.message || 'Message signing failed',
            }));
            return null;
        }
    }, [hasEthereum, state.address]);

    /**
     * 鍒囨崲鍒?BSC 閾?
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
            // 濡傛灉閾炬湭娣诲姞锛屽皾璇曟坊鍔?
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
                    console.error('娣诲姞 BSC 閾惧け璐?', addError);
                }
            }
        }
    }, [hasEthereum]);

    /**
     * 璁＄畻 keccak256 鍝堝笇锛堢敤浜?Commit-Reveal锛?
     * @param price 浠锋牸
     * @param salt 鐩愬€?
     * @returns 鍝堝笇瀛楃涓?
     */
    const computePriceHash = useCallback((price: number, salt: string): string => {
        const normalizedPrice = ethers.parseUnits(price.toString(), 18);
        return ethers.solidityPackedKeccak256(
            ['uint256', 'string'],
            [normalizedPrice, salt]
        );
    }, []);

    /**
     * 鐩戝惉璐︽埛鍜岄摼鍙樺寲
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

        // 鑷姩鎭㈠涔嬪墠鐨勮繛鎺?
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

