import CipherNotes from './components/CipherNotes';
import { WalletProvider } from './config/WalletProvider';
import { FhevmProvider } from './hooks/useFhevm';
import './styles/global.css';

function App() {
  return (
    <WalletProvider>
      <FhevmProvider>
        <CipherNotes />
      </FhevmProvider>
    </WalletProvider>
  );
}

export default App;
