import RadioPlayer from "@/components/RadioPlayer";
import { resolveRadioState } from "@/lib/radio";
import { getStation, isBroadcastable } from "@/lib/station";

import EmptyStation from "./EmptyStation";

/**
 * Yayın arayüzünü kuran sunucu bileşeni.
 *
 * Hem ana sayfa hem de paylaşım bağlantıları (/p/[videoId]) aynı yayını
 * gösterdiği için ortak yere alındı.
 */
export default async function LiveRadio() {
  const station = await getStation();

  if (!isBroadcastable(station)) {
    return (
      <EmptyStation
        name={station.name}
        showSetupHint={process.env.NODE_ENV === "development"}
      />
    );
  }

  // Sunucu bileşeni istek başına bir kez render edilir; istek anını okumak
  // burada kasıtlı ve doğrudur — istemciye zaman çapası olarak gider.
  // eslint-disable-next-line react-hooks/purity
  const serverNowMs = Date.now();

  return (
    <RadioPlayer
      initialStation={station}
      serverNowMs={serverNowMs}
      initialState={resolveRadioState(station, serverNowMs)}
    />
  );
}
