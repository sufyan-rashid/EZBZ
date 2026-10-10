import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import NetInfo from "@react-native-community/netinfo";

type NetworkContextType = { isConnected: boolean };
const NetworkContext = createContext<NetworkContextType>({ isConnected: true });

export function NetworkProvider({ children }: { children: ReactNode }) {
  const [isConnected, setIsConnected] = useState(true);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsConnected(state.isConnected !== false);
    });
    return () => unsubscribe();
  }, []);

  return <NetworkContext.Provider value={{ isConnected }}>{children}</NetworkContext.Provider>;
}

export function useNetwork() {
  return useContext(NetworkContext);
}
