'use client'

import { useState, useEffect, useRef } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

const SYMBOLS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
const SPIN_DURATION = 50 // milliseconds per symbol change (faster)
const DECELERATION_STEPS = [100, 150, 200, 250] // progressive slowdown (faster)
const AUTO_STOP_DELAY = 1500 // auto-stop after 1.5 seconds if user doesn't stop manually

const VISIBLE_PER_REEL = 3; // Number of visible numbers per reel
export default function SlotMachine() {
    // Each reel is an array of visible numbers
    const [reels, setReels] = useState([
        Array(VISIBLE_PER_REEL).fill(0),
        Array(VISIBLE_PER_REEL).fill(0),
        Array(VISIBLE_PER_REEL).fill(0)
    ])
    const [spinning, setSpinning] = useState(false)
    const [stopping, setStopping] = useState(false)
    const [showWin, setShowWin] = useState(false)
    const [winRow, setWinRow] = useState<number | null>(null)
    const [winType, setWinType] = useState<'row' | 'diag' | null>(null)
    const [wins, setWins] = useState<number>(0)
    const [losses, setLosses] = useState<number>(0)
    const [confetti, setConfetti] = useState<Array<{ id: number; left: number; color: string; delay: number }>>([])
    const [simulating, setSimulating] = useState<boolean>(false)
    const [isMobile, setIsMobile] = useState<boolean>(false)
    const simulatingRef = useRef<boolean>(false)

    const spinIntervals = useRef<NodeJS.Timeout[]>([])
    const stopTimeouts = useRef<NodeJS.Timeout[]>([])
    const autoStopTimeout = useRef<NodeJS.Timeout | null>(null)

    // Helper to pause
    const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

    useEffect(() => {
        const handleKeyPress = (e: KeyboardEvent) => {
            if (e.code === 'Space') {
                e.preventDefault()
                if (!spinning && !stopping) {
                    startSpin()
                } else if (spinning && !stopping) {
                    stopSpin()
                }
            }
        }

        window.addEventListener('keydown', handleKeyPress)
        return () => window.removeEventListener('keydown', handleKeyPress)
    }, [spinning, stopping])

    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 768 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent))
        }

        checkMobile()
        window.addEventListener('resize', checkMobile)
        return () => window.removeEventListener('resize', checkMobile)
    }, [])

    const startSpin = () => {
        setSpinning(true)
        setStopping(false)
        setShowWin(false)
        setConfetti([])

        spinIntervals.current = reels.map((_, index) => {
            return setInterval(() => {
                setReels(prev => {
                    const newReels = [...prev]
                    // Shift numbers up and add a new random symbol at the end
                    newReels[index] = [
                        ...prev[index].slice(1),
                        SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]
                    ]
                    return newReels
                })
            }, SPIN_DURATION)
        })

        autoStopTimeout.current = setTimeout(() => {
            stopSpin()
        }, AUTO_STOP_DELAY)
    }

    const stopSpin = () => {
        setStopping(true)

        if (autoStopTimeout.current) {
            clearTimeout(autoStopTimeout.current)
            autoStopTimeout.current = null
        }

        spinIntervals.current.forEach(interval => clearInterval(interval))

        reels.forEach((_, index) => {
            const baseDelay = index * 600
            let currentDelay = baseDelay

            DECELERATION_STEPS.forEach((duration, stepIndex) => {
                const timeout = setTimeout(() => {
                    setReels(prev => {
                        const newReels = [...prev]
                        // Shift numbers up and add a new random symbol at the end
                        newReels[index] = [
                            ...prev[index].slice(1),
                            SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]
                        ]
                        return newReels
                    })
                }, currentDelay)
                stopTimeouts.current.push(timeout)
                currentDelay += duration
            })

            const finalTimeout = setTimeout(() => {
                // Finalize the reel with random symbols
                const finalSymbols = Array(VISIBLE_PER_REEL)
                    .fill(0)
                    .map(() => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)])
                setReels(prev => {
                    const newReels = [...prev]
                    newReels[index] = finalSymbols
                    // If this is the last reel, schedule win-check with the finalized snapshot
                    if (index === 2) {
                        setTimeout(() => {
                            setSpinning(false)
                            setStopping(false)
                            checkWin(newReels)
                        }, 100)
                    }
                    return newReels
                })
            }, currentDelay)
            stopTimeouts.current.push(finalTimeout)
        })
    }

    // Simulate a number of full spins (start -> let auto-stop finish) sequentially
    const simulateSpins = async (count: number) => {
        if (simulatingRef.current) return
        setSimulating(true)
        simulatingRef.current = true
        try {
            const totalDecel = DECELERATION_STEPS.reduce((a, b) => a + b, 0)
            const maxReelBase = 2 * 600 // index 2 base delay
            const estimatedPerSpin = AUTO_STOP_DELAY + maxReelBase + totalDecel + 400 // small buffer

            for (let i = 0; i < count; i++) {
                // If the user interrupts, stop
                if (!simulatingRef.current) break
                startSpin()
                // wait for expected duration for a full spin to complete
                await wait(estimatedPerSpin)
                // small pause between spins
                await wait(200)
            }
        } finally {
            simulatingRef.current = false
            setSimulating(false)
        }
    }

    // Pure math simulation (no UI updates) that generates final reel snapshots
    const evaluateSnapshot = (snapshot: number[][]) => {
        // Returns { found, reason, winType, winRow }
        for (let row = 0; row < VISIBLE_PER_REEL; row++) {
            if (
                snapshot[0][row] === snapshot[1][row] &&
                snapshot[1][row] === snapshot[2][row]
            ) {
                return { found: true, reason: `Row ${row} match of symbol ${snapshot[0][row]}`, winType: 'row' as const, winRow: row }
            }
        }
        if (snapshot[0][0] === snapshot[1][1] && snapshot[1][1] === snapshot[2][2]) {
            return { found: true, reason: `Diagonal ↘ match of symbol ${snapshot[1][1]}`, winType: 'diag' as const, winRow: -1 }
        }
        if (snapshot[0][2] === snapshot[1][1] && snapshot[1][1] === snapshot[2][0]) {
            return { found: true, reason: `Diagonal ↗ match of symbol ${snapshot[1][1]}`, winType: 'diag' as const, winRow: -2 }
        }
        return { found: false, reason: 'No winning line found', winType: null, winRow: null }
    }

    const simulateMathSpins = (count: number) => {
        let simWins = 0
        let simLosses = 0
        const samples: Array<{ snapshot: number[][]; result: ReturnType<typeof evaluateSnapshot> }> = []

        for (let i = 0; i < count; i++) {
            // generate final snapshot: 3 reels x VISIBLE_PER_REEL symbols
            const snapshot: number[][] = [0, 1, 2].map(() =>
                Array.from({ length: VISIBLE_PER_REEL }, () => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)])
            )
            const res = evaluateSnapshot(snapshot)
            if (res.found) simWins++
            else simLosses++
            // store a few samples for inspection
            if (i < 5) samples.push({ snapshot, result: res })
        }

        console.log(`Math simulation (${count} spins) finished. Wins: ${simWins}, Losses: ${simLosses}, Win rate: ${(simWins / count * 100).toFixed(2)}%`)
        console.log('Sample results:', samples)
        // Apply results to UI counters
        setWins(w => w + simWins)
        setLosses(l => l + simLosses)
        return { wins: simWins, losses: simLosses }
    }

    const checkWin = (snapshot?: number[][]) => {
        // Use provided snapshot if available to avoid stale state timing issues
        const prev = snapshot ?? reels
        let foundWin = false
        let reason: string | null = null
        // Horizontal rows
        for (let row = 0; row < VISIBLE_PER_REEL; row++) {
            if (
                prev[0][row] === prev[1][row] &&
                prev[1][row] === prev[2][row]
            ) {
                setShowWin(true)
                setWinRow(row)
                setWinType('row')
                generateConfetti()
                foundWin = true
                reason = `Row ${row} match of symbol ${prev[0][row]}`
                console.log('WIN:', { reason, snapshot: prev })
                break
            }
        }
        // Diagonal: top-left to bottom-right
        if (!foundWin && prev[0][0] === prev[1][1] && prev[1][1] === prev[2][2]) {
            setShowWin(true)
            setWinRow(-1)
            setWinType('diag')
            generateConfetti()
            foundWin = true
            reason = `Diagonal ↘ match of symbol ${prev[1][1]}`
            console.log('WIN:', { reason, snapshot: prev })
        }
        // Diagonal: bottom-left to top-right
        if (!foundWin && prev[0][2] === prev[1][1] && prev[1][1] === prev[2][0]) {
            setShowWin(true)
            setWinRow(-2)
            setWinType('diag')
            generateConfetti()
            foundWin = true
            reason = `Diagonal ↗ match of symbol ${prev[1][1]}`
            console.log('WIN:', { reason, snapshot: prev })
        }

        if (foundWin) {
            setWins(w => w + 1)
        } else {
            reason = `No winning line found`
            console.log('LOSS:', { reason, snapshot: prev })
            setWinRow(null)
            setWinType(null)
            setShowWin(false)
            setLosses(l => l + 1)
        }
    }

    const generateConfetti = () => {
        const colors = ['oklch(0.75 0.25 330)', 'oklch(0.70 0.20 210)', 'oklch(0.80 0.22 150)', 'oklch(0.78 0.23 50)', 'oklch(0.72 0.21 280)']
        const newConfetti = Array.from({ length: 50 }, (_, i) => ({
            id: i,
            left: Math.random() * 100,
            color: colors[Math.floor(Math.random() * colors.length)],
            delay: Math.random() * 0.5
        }))
        setConfetti(newConfetti)
    }

    useEffect(() => {
        return () => {
            spinIntervals.current.forEach(interval => clearInterval(interval))
            stopTimeouts.current.forEach(timeout => clearTimeout(timeout))
            if (autoStopTimeout.current) {
                clearTimeout(autoStopTimeout.current)
            }
        }
    }, [])

    return (
        <div className="relative w-full max-w-4xl">
            {/* Simulate button (bottom-left) */}
            <div className="absolute left-4 bottom-4 z-30">
                <Button
                    size="sm"
                    onClick={() => simulateSpins(20)}
                    disabled={simulating || spinning || stopping}
                    className="bg-secondary/80 text-secondary-foreground"
                >
                    Simulate 20 Spins
                </Button>
                <div className="mt-2">
                    <Button
                        size="sm"
                        onClick={() => simulateMathSpins(20)}
                        disabled={simulating || spinning || stopping}
                        className="bg-secondary/60 text-secondary-foreground"
                    >
                        Math Sim 20
                    </Button>
                </div>
            </div>
            {confetti.map((piece) => (
                <div
                    key={piece.id}
                    className="confetti absolute w-2 h-2 rounded-full pointer-events-none"
                    style={{
                        left: `${piece.left}%`,
                        backgroundColor: piece.color,
                        animationDelay: `${piece.delay}s`,
                        top: -20
                    }}
                />
            ))}

            <Card className="p-8 md:p-12 border-2 border-primary/30 bg-card/80 backdrop-blur-sm shadow-[0_0_50px_rgba(0,0,0,0.5)]">
                <div className="text-center mb-8">
                    <h1
                        className="text-4xl md:text-6xl font-bold neon-text mb-2"
                        style={{
                            color: 'oklch(0.75 0.25 200)',
                            textShadow: '0 0 10px oklch(0.75 0.25 200), 0 0 20px oklch(0.75 0.25 200), 0 0 30px oklch(0.75 0.25 200)'
                        }}
                    >
                        SLOT MACHINE
                    </h1>
                </div>

                <div className="flex justify-center gap-4 md:gap-8 mb-8 relative">
                    {/* Draw win line if there's a win */}
                    {showWin && winRow !== null && (
                        winRow >= 0 ? (
                            // Horizontal win line (vertically centered on the row)
                            <div
                                className="absolute left-0 right-0 z-20 pointer-events-none"
                                style={{
                                    top: `calc((${winRow} + 0.5) * (100% / ${VISIBLE_PER_REEL}))`,
                                    height: '0',
                                }}
                            >
                                <svg width="100%" height="6" style={{ position: 'absolute', left: 0, right: 0 }}>
                                    <line x1="5%" y1="3" x2="95%" y2="3" stroke="oklch(0.80 0.22 150)" strokeWidth="4" strokeLinecap="round" />
                                </svg>
                            </div>
                        ) : winRow === -1 ? (
                            // Diagonal top-left to bottom-right
                            <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top: 0, height: '100%' }}>
                                <svg width="100%" height="100%" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}>
                                    <line x1="5%" y1="10%" x2="95%" y2="90%" stroke="oklch(0.80 0.22 150)" strokeWidth="4" strokeLinecap="round" />
                                </svg>
                            </div>
                        ) : winRow === -2 ? (
                            // Diagonal bottom-left to top-right
                            <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top: 0, height: '100%' }}>
                                <svg width="100%" height="100%" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}>
                                    <line x1="5%" y1="90%" x2="95%" y2="10%" stroke="oklch(0.80 0.22 150)" strokeWidth="4" strokeLinecap="round" />
                                </svg>
                            </div>
                        ) : null
                    )}
                    {reels.map((reel, index) => (
                        <div
                            key={index}
                            className={`relative ${showWin ? 'win-flash' : ''}`}
                        >
                            <div
                                className="relative w-24 h-32 md:w-32 md:h-40 lg:w-40 lg:h-48 rounded-xl overflow-hidden border-4 shadow-[inset_0_0_30px_rgba(0,0,0,0.8)] flex flex-col justify-center"
                                style={{
                                    borderColor: showWin
                                        ? 'oklch(0.80 0.22 150)'
                                        : index === 0
                                            ? 'oklch(0.75 0.25 330)'
                                            : index === 1
                                                ? 'oklch(0.70 0.20 210)'
                                                : 'oklch(0.78 0.23 50)',
                                    backgroundColor: 'oklch(0.05 0.02 270)'
                                }}
                            >
                                <div
                                    className="absolute inset-0 opacity-20 blur-xl"
                                    style={{
                                        backgroundColor: showWin
                                            ? 'oklch(0.80 0.22 150)'
                                            : index === 0
                                                ? 'oklch(0.75 0.25 330)'
                                                : index === 1
                                                    ? 'oklch(0.70 0.20 210)'
                                                    : 'oklch(0.78 0.23 50)'
                                    }}
                                />

                                <div className="relative z-10 h-full flex flex-col items-center justify-center">
                                    {reel.map((symbol, rowIdx) => (
                                        <span
                                            key={rowIdx}
                                            className="text-4xl md:text-5xl lg:text-6xl font-bold transition-all duration-200"
                                            style={{
                                                color: showWin
                                                    ? 'oklch(0.80 0.22 150)'
                                                    : index === 0
                                                        ? 'oklch(0.75 0.25 330)'
                                                        : index === 1
                                                            ? 'oklch(0.70 0.20 210)'
                                                            : 'oklch(0.78 0.23 50)',
                                                textShadow: showWin
                                                    ? '0 0 20px oklch(0.80 0.22 150), 0 0 40px oklch(0.80 0.22 150)'
                                                    : index === 0
                                                        ? '0 0 20px oklch(0.75 0.25 330)'
                                                        : index === 1
                                                            ? '0 0 20px oklch(0.70 0.20 210)'
                                                            : '0 0 20px oklch(0.78 0.23 50)'
                                            }}
                                        >
                                            {symbol}
                                        </span>
                                    ))}
                                </div>

                                <div className="absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-transparent pointer-events-none" />
                            </div>
                        </div>
                    ))}
                </div>

                {showWin && (
                    <div className="text-center mb-6">
                        <div className="inline-block px-6 py-3 rounded-lg bg-accent/20 border-2 border-accent">
                            <p className="text-2xl md:text-4xl font-bold text-accent neon-text">
                                🎉 WINNER! 🎉
                            </p>
                            <p className="text-accent-foreground mt-1">
                                {winType === 'row' && winRow === 0 && 'Top row matches!'}
                                {winType === 'row' && winRow === 1 && 'Middle row matches!'}
                                {winType === 'row' && winRow === 2 && 'Bottom row matches!'}
                                {winType === 'diag' && winRow === -1 && 'Diagonal (↘) matches!'}
                                {winType === 'diag' && winRow === -2 && 'Diagonal (↗) matches!'}
                            </p>
                        </div>
                    </div>
                )}

                <div className="text-center">
                    <Button
                        size="lg"
                        onClick={() => {
                            if (!spinning && !stopping) {
                                startSpin()
                            } else if (spinning && !stopping) {
                                stopSpin()
                            }
                        }}
                        disabled={stopping}
                        className="relative px-8 py-6 text-xl font-bold overflow-hidden group"
                        style={{
                            backgroundColor: spinning ? 'oklch(0.70 0.20 210)' : 'oklch(0.75 0.25 330)',
                            color: 'oklch(0.98 0.01 90)'
                        }}
                    >
                        <span className="relative z-10">
                            {stopping ? 'STOPPING...' : spinning ? (isMobile ? 'STOP' : 'STOP (SPACE)') : (isMobile ? 'SPIN' : 'SPIN (SPACE)')}
                        </span>
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                    </Button>
                </div>

                <div className="mt-6 text-center">
                    <div className="inline-flex items-center gap-6 px-4 py-2 rounded-lg bg-muted/10">
                        <div className="text-sm text-muted-foreground">
                            <div className="font-bold">Wins</div>
                            <div className="text-2xl font-mono">{wins}</div>
                        </div>
                        <div className="h-8 border-l border-muted/30" />
                        <div className="text-sm text-muted-foreground">
                            <div className="font-bold">Losses</div>
                            <div className="text-2xl font-mono">{losses}</div>
                        </div>
                    </div>

                    <div className="mt-4 text-sm text-muted-foreground">
                        <p>🎰 {isMobile ? 'Tap button to spin • Tap again to stop' : 'Press SPACEBAR or click button to spin • Press SPACEBAR again to stop'}</p>
                    </div>
                </div>
            </Card>

            {/* Win Rate Display */}
            <div className="mt-6 text-center">
                <p className="text-white text-xl font-medium">
                    Win Rate: {wins + losses > 0 ? ((wins / (wins + losses)) * 100).toFixed(2) : '0.00'}%
                </p>
            </div>
        </div>
    )
}
