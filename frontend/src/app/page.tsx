import WalletConnect from "../components/wallet/WalletConnect";

export default function Home() {
  return (
    <div className="min-h-screen bg-navy text-white py-16 px-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-4 text-center">TipTune</h1>
        <p className="text-xl text-ice-blue text-center mb-12">
          Real-time music tips powered by Stellar
        </p>
        
        <div className="mb-8">
          <WalletConnect />
        </div>
      </div>
    </div>
  );
}
