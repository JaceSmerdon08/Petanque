import { useEffect, useMemo, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

type Seat = "one" | "two";
type GameState = {
  roomId: string; players: Record<Seat, { seat: Seat; boulesThrown: number } | null>;
  scores: Record<Seat, number>; end: number; activeSeat: Seat; jack: { x: number; y: number }; jackPlaced: boolean;
  boules: { id: string; seat: Seat; x: number; y: number }[]; winner: Seat | null;
};
const API = import.meta.env.VITE_API_URL ?? "";
const linksKey = "petanque-seat-links";
type Links = Record<string, { one: string; two: string }>;

export default function App() {
  const [links, setLinks] = useState<Links>(() => JSON.parse(localStorage.getItem(linksKey) ?? "{}"));
  const [roomId, setRoomId] = useState(new URLSearchParams(location.hash.slice(1)).get("room") ?? "");
  const [token, setToken] = useState(new URLSearchParams(location.hash.slice(1)).get("seat") ?? "");
  const [state, setState] = useState<GameState | null>(null);
  const [seat, setSeat] = useState<Seat | null>(null);
  const [status, setStatus] = useState("Offline");
  const [angle, setAngle] = useState(0);
  // This power places the opening jack inside the legal 6–10 m range.
  const [power, setPower] = useState(80);
  const [message, setMessage] = useState("");
  const liveSocket = useRef<Socket | null>(null);

  useEffect(() => {
    localStorage.setItem(linksKey, JSON.stringify(links));
  }, [links]);

  useEffect(() => {
    if (!roomId || !token) return;
    const socket: Socket = io(API, { autoConnect: true, reconnection: true });
    liveSocket.current = socket;
    socket.on("connect", () => {
      setStatus("Connected");
      socket.emit("room:join", { roomId, token }, (reply: { ok: boolean; seat?: Seat; state?: GameState; error?: string }) => {
        if (!reply.ok) { setMessage(reply.error ?? "Could not join this seat."); setStatus("Link invalid"); return; }
        setSeat(reply.seat!);
        setState(reply.state!);
        setMessage("");
      });
    });
    socket.on("disconnect", () => setStatus("Reconnecting…"));
    socket.on("connect_error", () => setStatus("Connection unavailable"));
    socket.on("game:state", (next: GameState) => setState(next));
    socket.on("player:connected", () => setMessage("Your friend is connected."));
    socket.on("player:disconnected", () => setMessage("Your friend disconnected. Their seat is saved."));
    return () => { socket.disconnect(); liveSocket.current = null; };
  }, [roomId, token]);

  const createRoom = async () => {
    setMessage("Creating a private match…");
    try {
      const response = await fetch(`${API}/api/rooms`, { method: "POST" });
      if (!response.ok) throw new Error("The game server did not create a room.");
      const created = await response.json() as { roomId: string; seatLinks: { one: string; two: string } };
      const next = { ...links, [created.roomId]: created.seatLinks };
      setLinks(next); setRoomId(created.roomId); setToken(created.seatLinks.one);
      history.replaceState(null, "", `#room=${created.roomId}&seat=${created.seatLinks.one}`);
      setMessage("Room ready. Copy your friend's link to invite them.");
    } catch { setMessage("Couldn't reach the game server. Start the API and try again."); }
  };

  const shareUrl = useMemo(() => {
    const credentials = links[roomId];
    if (!credentials || !seat) return "";
    return `${location.origin}/#room=${roomId}&seat=${credentials[seat === "one" ? "two" : "one"]}`;
  }, [links, roomId, seat]);
  const closestBouleId = useMemo(() => {
    if (!state?.boules.length) return null;
    return state.boules.reduce((closest, boule) =>
      Math.hypot(boule.x - state.jack.x, boule.y - state.jack.y) <
      Math.hypot(closest.x - state.jack.x, closest.y - state.jack.y) ? boule : closest,
    ).id;
  }, [state]);
  const closestSeat = useMemo(() => {
    if (!state?.boules.length) return null;
    const distances: Record<Seat, number> = { one: Infinity, two: Infinity };
    for (const boule of state.boules) {
      distances[boule.seat] = Math.min(distances[boule.seat], Math.hypot(boule.x - state.jack.x, boule.y - state.jack.y));
    }
    return distances.one === distances.two ? null : distances.one < distances.two ? "one" : "two";
  }, [state]);
  const throwAction = () => {
    liveSocket.current?.emit(state?.jackPlaced ? "game:throw" : "game:throw-jack", { actionId: crypto.randomUUID(), angle, power }, (reply: { ok: boolean; error?: string }) => {
      if (!reply.ok) setMessage(reply.error ?? "Throw rejected.");
      else setMessage("");
    });
  };
  return <main className="shell">
    <header className="topbar"><a className="brand" href="/">● <span>PÉTANQUE<br /><b>TOGETHER</b></span></a><span className={`connection ${status === "Connected" ? "online" : ""}`}><i />{status}</span></header>
    {!state ? <section className="welcome">
      <div className="eyebrow">A LITTLE FRIENDLY COMPETITION</div>
      <h1>Meet you<br /><em>on the piste.</em></h1>
      <p>One friend, three boules each, first to 13. No accounts, no fuss—just a private link to your match.</p>
      <button className="primary" onClick={createRoom}>Create a private match <span>↗</span></button>
      {roomId && token && <div className="notice">Rejoining your saved seat…</div>}
      {message && <div className="notice" role="status">{message}</div>}
      <div className="rule-note"><span>01</span> Singles <span>·</span> 3 boules <span>·</span> First to 13</div>
    </section> : <section className="match">
      <div className="match-head"><div><div className="eyebrow">PRIVATE MATCH <span className="room-id">#{roomId}</span></div><h1>End {state.end}</h1></div>
        {links[roomId] && seat && <button className="share" onClick={() => navigator.clipboard.writeText(shareUrl)}>Copy friend's seat link ↗</button>}</div>
      {message && <div className="notice" role="status">{message}</div>}
      <div className="scoreboard">
        <div className={seat === "one" ? "score active" : "score"}><span>{seat === "one" ? "YOU" : "FRIEND"} <small>{state.players.one ? "●" : "○"}</small></span><strong>{state.scores.one}</strong><small>{3 - (state.players.one?.boulesThrown ?? 0)} boules left</small></div>
        <div className="versus">VS</div>
        <div className={seat === "two" ? "score active" : "score"}><span>{seat === "two" ? "YOU" : "FRIEND"} <small>{state.players.two ? "●" : "○"}</small></span><strong>{state.scores.two}</strong><small>{3 - (state.players.two?.boulesThrown ?? 0)} boules left</small></div>
      </div>
      <div className="turn-banner">{state.winner ? `Player ${state.winner === seat ? "you" : "friend"} wins!` : !state.players.two ? "Share your private seat link to start playing" : state.activeSeat === seat ? "Your turn — take your shot" : "Waiting for your friend to play"}</div>
      {closestSeat && <div className="comparison">Closest to the jack: {closestSeat === seat ? "you" : "your friend"} <span>·</span> ringed boule holds the point for now</div>}
      {!closestSeat && state.boules.length > 1 && <div className="comparison">Closest boule is tied</div>}
      <div className="piste" aria-label="Pétanque piste showing boule positions">
        <div className="piste-lines" />
        {state.jackPlaced && <div className="jack" title="Jack" style={{ left: `${state.jack.x}%`, top: `${state.jack.y}%` }} />}
        {state.boules.map((boule, i) => <div key={boule.id} className={`boule ${boule.seat === "one" ? "boule-one" : "boule-two"} ${boule.id === closestBouleId ? "boule-closest" : ""}`} style={{ left: `${boule.x}%`, top: `${boule.y}%` }} title={`Player ${boule.seat} boule ${i + 1}${boule.id === closestBouleId ? ", closest to jack" : ""}`} />)}
        {!state.boules.length && <div className="board-hint">{state.jackPlaced ? "The jack is set. Place your boule close." : "Choose a direction and power to throw the jack."}</div>}
      </div>
      {state.winner ? <div className="finished">Match complete · final score {state.scores.one} – {state.scores.two}</div> :
        <div className="controls">
          <label>Direction <input aria-label="Throw direction" type="range" min="-80" max="80" value={angle} onChange={e => setAngle(Number(e.target.value))} /><span>{angle}°</span></label>
          <label>Power <input aria-label="Throw power" type="range" min="1" max="100" value={power} onChange={e => setPower(Number(e.target.value))} /><span>{power}%</span></label>
          <button className="primary" disabled={!state.players.two || state.activeSeat !== seat} onClick={throwAction}>{state.jackPlaced ? "Throw boule" : "Throw the jack"} <span>↗</span></button>
        </div>}
      <p className="footnote">This link is a private bearer credential. Keep it to yourself—anyone with it can play as you.</p>
    </section>}
    <footer><span>Pétanque, at your own pace.</span><span>Classic singles · 3 boules · first to 13</span></footer>
  </main>;
}
