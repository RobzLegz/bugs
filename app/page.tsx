import Link from "next/link";

export default function Home() {
  return (
    <div className="w-full h-screen bg-black flex items-center justify-center">
      <Link href="/game">Play</Link>
    </div>
  );
}
