import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { io, Socket } from "socket.io-client";

type Seat = "one" | "two";
type Aim = { x: number; y: number; angle: number; power: number };
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
  const [message, setMessage] = useState("");
  const liveSocket = useRef<Socket | null>(null);
  const pisteRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const [aim, setAim] = useState<Aim | null>(null);

  useEffect(() => {
    dragStart.current = null;
    setAim(null);
  }, [state?.activeSeat, state?.end, state?.boules.length, state?.jackPlaced]);

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
  const canThrow = !!state?.players.two && state.activeSeat === seat && !state.winner;
  const updateAim = (clientX: number, clientY: number): Aim | null => {
    const piste = pisteRef.current;
    if (!piste) return null;
    const rect = piste.getBoundingClientRect();
    const x = Math.max(8.7, Math.min(78, ((clientX - rect.left) / rect.width) * 100));
    const y = Math.max(2, Math.min(58, ((clientY - rect.top) / rect.height) * 60));
    const power = Math.max(1, Math.min(100, (x - 8) / 0.7));
    const travel = power * 0.7;
    const angle = Math.max(-80, Math.min(80, Math.atan((y - 30) / (travel * 0.35)) * (180 / Math.PI)));
    const nextAim = { x: 8 + travel, y: 30 + Math.tan((angle * Math.PI) / 180) * travel * 0.35, angle, power };
    setAim(nextAim);
    return nextAim;
  };
  const throwAction = (intent: Aim) => {
    liveSocket.current?.emit(state?.jackPlaced ? "game:throw" : "game:throw-jack", { actionId: crypto.randomUUID(), angle: intent.angle, power: intent.power }, (reply: { ok: boolean; error?: string }) => {
      if (!reply.ok) setMessage(reply.error ?? "Throw rejected.");
      else setMessage("");
    });
  };
  const startAim = (event: PointerEvent<HTMLDivElement>) => {
    if (!canThrow) return;
    const piste = pisteRef.current;
    if (!piste) return;
    const rect = piste.getBoundingClientRect();
    const throwX = rect.left + rect.width * 0.08;
    const throwY = rect.top + rect.height * 0.5;
    if (Math.hypot(event.clientX - throwX, event.clientY - throwY) > 32) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStart.current = { x: event.clientX, y: event.clientY };
    updateAim(event.clientX, event.clientY);
  };
  const moveAim = (event: PointerEvent<HTMLDivElement>) => {
    if (dragStart.current) updateAim(event.clientX, event.clientY);
  };
  const endAim = (event: PointerEvent<HTMLDivElement>) => {
    const start = dragStart.current;
    if (!start) return;
    dragStart.current = null;
    const nextAim = updateAim(event.clientX, event.clientY);
    if (nextAim && Math.hypot(event.clientX - start.x, event.clientY - start.y) >= 6) {
      throwAction(nextAim);
    }
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
      <div className={`turn-banner ${canThrow ? "turn-ready" : ""}`} aria-live="polite">
        {state.winner ? `Player ${state.winner === seat ? "you" : "friend"} wins!` : !state.players.two ? "Share your private seat link to start playing" : state.activeSeat === seat ? "YOUR TURN · Drag on the piste to aim" : "FRIEND'S TURN · Watch their shot"}
      </div>
      {closestSeat && <div className="comparison">Closest to the jack: {closestSeat === seat ? "you" : "your friend"} <span>·</span> ringed boule holds the point for now</div>}
      {!closestSeat && state.boules.length > 1 && <div className="comparison">Closest boule is tied</div>}
      <div ref={pisteRef} className={`piste ${canThrow ? "piste-aimable" : ""}`} aria-label="Pétanque piste showing boule positions" onPointerDown={startAim} onPointerMove={moveAim} onPointerUp={endAim} onPointerCancel={() => { dragStart.current = null; setAim(null); }}>
        <div className="piste-lines" />
        {canThrow && <div className="throw-circle" aria-hidden="true" />}
        {state.jackPlaced && <div className="jack" title="Jack" style={{ left: `${state.jack.x}%`, top: `${state.jack.y}%` }} />}
        {state.boules.map((boule, i) => <div key={boule.id} className={`boule ${boule.seat === "one" ? "boule-one" : "boule-two"} ${boule.id === closestBouleId ? "boule-closest" : ""}`} style={{ left: `${boule.x}%`, top: `${boule.y}%` }} title={`Player ${boule.seat} boule ${i + 1}${boule.id === closestBouleId ? ", closest to jack" : ""}`} />)}
        {aim && canThrow && <svg className="aim-preview" viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden="true">
          <defs><marker id="aim-arrowhead" markerWidth="4" markerHeight="4" refX="3" refY="2" orient="auto"><path d="M0,0 L4,2 L0,4 Z" /></marker></defs>
          <line x1="8" y1="30" x2={aim.x} y2={aim.y} markerEnd="url(#aim-arrowhead)" style={{ strokeWidth: 0.7 + aim.power / 35, opacity: 0.45 + aim.power / 200 }} />
        </svg>}
        {canThrow && !aim && <div className="board-hint">Drag from the throwing circle to aim · further right means more power</div>}
      </div>
      {state.winner ? <div className="finished">Match complete · final score {state.scores.one} – {state.scores.two}</div> :
        <div className="controls"><span>{canThrow && aim ? `Aim ${Math.round(aim.angle)}° · Power ${Math.round(aim.power)}%` : canThrow ? "Drag on the piste to line up your throw" : "Waiting for your turn"}</span><span className="throw-tip">Release to throw</span></div>}
      <p className="footnote">This link is a private bearer credential. Keep it to yourself—anyone with it can play as you.</p>
    </section>}
    <footer><span>Pétanque, at your own pace.</span><span>Classic singles · 3 boules · first to 13</span></footer>
  </main>;
}
