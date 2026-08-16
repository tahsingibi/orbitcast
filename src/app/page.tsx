import LiveRadio from "@/components/LiveRadio";

// Yayın konumu istek anına bağlı olduğu için sayfa statik üretilmemeli.
export const dynamic = "force-dynamic";

export default function Home() {
  return <LiveRadio />;
}
