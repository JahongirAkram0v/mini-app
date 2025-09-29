import { useCallback, useEffect, useRef, useState } from 'react'

// STOMP/SockJS kutubxonalari global o'zgaruvchilar sifatida mavjud deb faraz qilinadi (masalan, <script> teglar orqali yuklangan).
// const SockJS = window.SockJS;
// const Stomp = window.Stomp;
// const tg = window.Telegram.WebApp;

function App() {
	// --- KONFIGURATSIYA ---
	// Ngrok manzilini doimiy ravishda yangilab turishingiz kerak
	const BACKEND_URL = 'https://5c84c838a311.ngrok-free.app'
	// -----------------------

	// --- HOLATNI BOSHQARISH (STATE MANAGEMENT) ---
	const [playerData, setPlayerData] = useState(null)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState(null)
	const [logList, setLogList] = useState([])
	const [wsStatus, setWsStatus] = useState(false) // WebSocket ulanish holati
	const [groupData, setGroupData] = useState('Ulanish kutilmoqda...')
	const [inputState, setInputState] = useState('WAITING')
	const [inputChooseId, setInputChooseId] = useState('')

	// --- MUTABLE O'ZGARUVCHILAR (useRef) ---
	const stompClientRef = useRef(null)
	const currentChatIdRef = useRef(null)
	const currentGroupIdRef = useRef(null)
	const tgRef = useRef(window.Telegram.WebApp)
	const logListElRef = useRef(null) // Loglar uchun elementga murojaat

	// --- YORDAMCHI FUNKSIYALAR ---

	// Konsol loglari o'rniga ishlatiladigan funksiya
	const customLog = useCallback((message, type = 'log') => {
		const timestamp = new Date().toLocaleTimeString()
		const logMessage = `[${timestamp}] ${message}`

		setLogList(prevLogs => {
			const newLogs = [...prevLogs, { message: logMessage, type }]
			return newLogs.slice(-30) // Oxirgi 30 ta logni saqlash
		})

		if (type === 'error') {
			console.error(logMessage)
		} else {
			console.log(logMessage)
		}
	}, [])

	// Loglar yangilanganda avtomatik pastga skroll qilish
	useEffect(() => {
		if (logListElRef.current) {
			logListElRef.current.scrollTop = logListElRef.current.scrollHeight
		}
	}, [logList])

	// WebSocket holatini yangilash
	const updateWebsocketStatus = useCallback(
		isConnected => {
			setWsStatus(isConnected)
			if (isConnected) {
				customLog('WebSocket ulanishi muvaffaqiyatli!')
			} else {
				customLog('WebSocket aloqasi uzildi.', 'error')
			}
		},
		[customLog]
	)

	// WebSocket ulanishi mantig'i
	const connectSocket = useCallback(
		groupId => {
			if (stompClientRef.current && stompClientRef.current.connected) {
				customLog('WebSocket allaqachon ulangan. Qayta ulanish shart emas.')
				return
			}

			customLog(
				`Guruh ID (${groupId}) uchun WebSocket ulanishga urinilmoqda...`
			)
			updateWebsocketStatus(false)
			setGroupData(
				"WebSocket orqali guruh ma'lumotlariga ulanishga urinilmoqda..."
			)

			// Stomp va SockJS global ravishda mavjud bo'lishi kerak
			if (
				typeof window.SockJS === 'undefined' ||
				typeof window.Stomp === 'undefined'
			) {
				customLog(
					'❌ SockJS yoki Stomp kutubxonalari topilmadi. Iltimos, HTML da script taglarini tekshiring.',
					'error'
				)
				return
			}

			try {
				const socket = new window.SockJS(`${BACKEND_URL}/ws`)
				const client = window.Stomp.over(socket)
				client.debug = null // Debug loglarini o'chirish

				client.connect(
					{},
					() => {
						// Muvaffaqiyatli ulansa
						stompClientRef.current = client
						updateWebsocketStatus(true)

						// Obuna bo'lish
						client.subscribe(`/topic/room/${groupId}`, message => {
							try {
								const data = JSON.parse(message.body)
								setGroupData(JSON.stringify(data, null, 2))
								customLog("Guruh ma'lumoti qabul qilindi.")
							} catch (e) {
								customLog(
									`WebSocket xabarini o'qishda xatolik: ${e.message}`,
									'error'
								)
								setGroupData("Xato: Ma'lumot formati noto'g'ri.")
							}
						})
						customLog(`'/topic/room/${groupId}' mavzusiga obuna bo'lindi.`)
					},
					error => {
						// Ulanishda xatolik bo'lsa
						customLog(
							`WebSocket ulanishda xatolik: ${error.message || error}`,
							'error'
						)
						updateWebsocketStatus(false)
						setGroupData(
							"Serverga ulanib bo'lmadi. Internet aloqasini tekshiring."
						)
						tgRef.current.showAlert(
							'Server bilan aloqa uzildi. Iltimos, sahifani yangilang.'
						)
					}
				)

				// SockJS ulanish uzilganda (kutilmaganda)
				socket.onclose = () => {
					customLog('WebSocket aloqasi kutilmaganda uzildi.')
					updateWebsocketStatus(false)
				}
			} catch (e) {
				customLog(
					`WebSocket ulanishni yaratishda xatolik: ${e.message}`,
					'error'
				)
				updateWebsocketStatus(false)
			}
		},
		[BACKEND_URL, customLog, updateWebsocketStatus]
	)

	// O'yinchi ma'lumotlarini yuklash (HTTP fetch)
	const fetchPlayerData = useCallback(
		async chatId => {
			setError(null)
			setLoading(true)
			customLog(
				`API orqali o'yinchi ma'lumotlarini yuklash: ${BACKEND_URL}/player/${chatId}`
			)

			try {
				// Ngrok ogohlantirishini o'tkazib yuborish uchun maxsus sarlavha qo'shildi!
				const response = await fetch(`${BACKEND_URL}/player/${chatId}`, {
					headers: {
						'ngrok-skip-browser-warning': '69420',
						Accept: 'application/json',
					},
				})

				if (!response.ok) {
					const status = response.status
					let errorDetails = `Server xatosi (${status}).`
					try {
						const jsonError = await response.json()
						errorDetails = `Server xatosi (${status}): ${JSON.stringify(
							jsonError,
							null,
							2
						)}`
					} catch {
						const textError = await response.text()
						errorDetails = `Server xatosi (${status}): Kutilmagan javob formatida.`
						console.error('Serverdan kelgan kutilmagan javob:', textError)
					}
					throw new Error(errorDetails)
				}

				const data = await response.json()
				setPlayerData(data)
				currentGroupIdRef.current = data.groupId
				setInputState(data.playerState)

				customLog(`O'yinchi ma'lumotlari yuklandi. Guruh ID: ${data.groupId}`)
			} catch (err) {
				let errorMessage = err.message.includes('Failed to fetch')
					? 'Tarmoq ulanishida muammo yoki Ngrok tuneli yopilgan. Iltimos, aloqani tekshiring.'
					: err.message
				setError(errorMessage)
				customLog(
					`O'yinchi ma'lumotlarini yuklashda xatolik: ${errorMessage}`,
					'error'
				)
			} finally {
				setLoading(false)
			}
		},
		[BACKEND_URL, customLog]
	)

	// O'zgarishni serverga yuborish (STOMP send)
	const sendUpdate = useCallback(() => {
		const client = stompClientRef.current
		const chatId = currentChatIdRef.current
		const groupId = currentGroupIdRef.current

		if (!client || !client.connected) {
			tgRef.current.HapticFeedback.notificationOccurred('error')
			tgRef.current.showAlert(
				"❌ Server bilan aloqa yo'q (WebSocket uzilgan). Iltimos, qayta ulanishni kuting."
			)
			customLog("Ma'lumot yuborish rad etildi: WebSocket uzilgan.", 'error')
			return
		}

		const choosePlayerIdValue = inputChooseId.trim()

		const payload = {
			chatId: chatId,
			playerState: inputState,
			choosePlayerId: choosePlayerIdValue
				? parseInt(choosePlayerIdValue)
				: null,
			groupId: groupId,
			groupState: null,
		}

		customLog(`Serverga yuborilmoqda: ${JSON.stringify(payload)}`)

		try {
			client.send('/app/game.send', {}, JSON.stringify(payload))
			tgRef.current.HapticFeedback.notificationOccurred('success')
			tgRef.current.showAlert("✅ Ma'lumot muvaffaqiyatli yuborildi!")
			customLog("Ma'lumot muvaffaqiyatli yuborildi.")
		} catch (e) {
			customLog(`STOMP xabarini yuborishda xatolik: ${e.message}`, 'error')
			tgRef.current.HapticFeedback.notificationOccurred('error')
			tgRef.current.showAlert("❌ Ma'lumotni yuborishda xatolik yuz berdi.")
		}
	}, [customLog, inputState, inputChooseId])

	// --- REACT LIFECYCLE HOOKLARI ---

	// 1. Telegram WebApp ni ishga tushirish va foydalanuvchi ma'lumotlarini olish
	useEffect(() => {
		const tg = tgRef.current
		tg.ready()
		tg.expand()
		customLog('Telegram Web App tayyorlandi.')

		const user = tg.initDataUnsafe?.user

		if (user?.id) {
			currentChatIdRef.current = user.id
			customLog(`Foydalanuvchi ID: ${currentChatIdRef.current}`)
			fetchPlayerData(user.id)
		} else {
			setError(
				"Xatolik: Ilovani Telegram orqali oching. Foydalanuvchi ma'lumotlari topilmadi."
			)
			customLog('Telegram user data topilmadi.', 'error')
			setLoading(false)
		}
	}, [customLog, fetchPlayerData]) // Bir marta ishga tushadi

	// 2. Guruh ID mavjud bo'lsa WebSocket ga ulanish
	useEffect(() => {
		if (playerData?.groupId) {
			connectSocket(playerData.groupId)

			// Cleanup funksiyasi: komponent o'chirilganda yoki ID o'zgarganda WebSocket ni uzish
			return () => {
				const client = stompClientRef.current
				if (client && client.connected) {
					try {
						client.disconnect(() => {
							customLog('WebSocket ulanishi tozalash (cleanup) orqali uzildi.')
						})
					} catch {
						customLog('WebSocket ulanishni uzishda xatolik yuz berdi.', 'error')
					}
				}
				stompClientRef.current = null
			}
		}
	}, [playerData?.groupId, connectSocket, customLog])

	// --- UI YORDAMCHI KOMPONENTLARI ---

	const StatusBadge = ({ state }) => {
		const base =
			'inline-block py-1 px-3 rounded-full text-white font-medium text-sm'
		const classes =
			{
				WAITING: 'bg-yellow-600',
				READY: 'bg-green-500',
				PLAYING: 'bg-blue-600',
				IN_GAME: 'bg-teal-500',
				LOSE: 'bg-red-600',
				WIN: 'bg-green-700',
				default: 'bg-gray-500',
			}[state] || classes.default

		return <span className={`${base} ${classes}`}>{state}</span>
	}

	// --- RENDER QISMI ---

	// Telegram ranglari uchun uslublar (CSSni JSX ichiga kiritish)
	const tgThemeCSS = `
        :root {
            --tg-bg-color: ${tgRef.current.themeParams.bg_color || '#f9fafb'};
            --tg-text-color: ${tgRef.current.themeParams.text_color || '#222'};
            --tg-hint-color: ${tgRef.current.themeParams.hint_color || '#999'};
            --tg-button-color: ${
							tgRef.current.themeParams.button_color || '#007BFF'
						};
            --tg-button-text-color: ${
							tgRef.current.themeParams.button_text_color || '#ffffff'
						};
            --tg-secondary-bg-color: ${
							tgRef.current.themeParams.secondary_bg_color || '#ffffff'
						};
            --tg-border-color: #e0e0e0;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            background-color: var(--tg-bg-color);
            color: var(--tg-text-color);
        }

        .card {
            background: var(--tg-secondary-bg-color);
            border-radius: 12px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.05);
        }

        input, select, pre {
            border: 1px solid var(--tg-border-color);
            background: var(--tg-bg-color);
            color: var(--tg-text-color);
        }

        .btn {
             background: var(--tg-button-color);
             color: var(--tg-button-text-color);
             transition: opacity 0.2s ease;
        }
        .btn:hover {
            opacity: 0.85;
        }
        .btn:disabled {
            background-color: var(--tg-hint-color);
            cursor: not-allowed;
        }
        .status-WAITING { background: #f39c12; }
        .status-READY { background: #2ecc71; }
        .status-PLAYING { background: #3498db; }
        .status-IN_GAME { background: #1abc9c; }
        .status-LOSE { background: #e74c3c; }
        .status-WIN { background: #008000; }
        .log-error {
            color: #c62828;
            font-weight: bold;
        }
    `

	// Asosiy UI
	return (
		<div className='p-4 flex flex-col gap-5 min-h-screen'>
			<style>{tgThemeCSS}</style>

			<h1 className='text-xl font-bold text-center text-tg-text-color'>
				🎮 O'yin Paneli (React)
			</h1>

			{/* Global holat xabarlari */}
			{(loading || error) && (
				<div
					className={`p-4 rounded-lg font-medium text-center ${
						error ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
					}`}
				>
					{loading ? "⏳ O'yinchi ma'lumotlari yuklanmoqda..." : `❌ ${error}`}
				</div>
			)}

			{/* O'yinchi Ma'lumotlari */}
			{playerData && (
				<div id='playerCard' className='card p-4'>
					<h3 className='text-lg font-semibold border-b border-tg-border-color pb-2 mb-3'>
						Sizning ma'lumotingiz
					</h3>

					<div
						id='websocketStatus'
						className={`p-2 rounded-lg font-bold mb-3 text-sm text-center ${
							wsStatus
								? 'websocket-connected bg-green-100 text-green-700'
								: 'websocket-disconnected bg-red-100 text-red-700'
						}`}
					>
						WebSocket: {wsStatus ? 'Ulangan ✅' : 'Uzilgan ❌'}
					</div>

					<div id='playerInfo' className='text-sm'>
						<strong>Chat ID:</strong> {playerData.chatId}
						<br />
						<strong>Group ID:</strong>{' '}
						{playerData.groupId ?? 'Guruhga qo‘shilmagan'}
						<br />
						<strong>Holati:</strong>{' '}
						<StatusBadge state={playerData.playerState} />
					</div>
				</div>
			)}

			{/* O'yinni Boshqarish */}
			{playerData && (
				<div id='editSection' className='card p-4'>
					<h3 className='text-lg font-semibold border-b border-tg-border-color pb-2 mb-3'>
						O'yinni Boshqarish
					</h3>

					<label
						htmlFor='playerState'
						className='block text-sm mb-1 mt-2 text-tg-hint-color'
					>
						Holatni o'zgartirish:
					</label>
					<select
						id='playerState'
						value={inputState}
						onChange={e => setInputState(e.target.value)}
						className='w-full p-3 rounded-lg text-base'
					>
						{['WAITING', 'READY', 'PLAYING', 'IN_GAME', 'LOSE', 'WIN'].map(
							state => (
								<option key={state} value={state}>
									{state}
								</option>
							)
						)}
					</select>

					<label
						htmlFor='choosePlayerId'
						className='block text-sm mb-1 mt-3 text-tg-hint-color'
					>
						O'yinchi ID'sini tanlash (ixtiyoriy):
					</label>
					<input
						type='number'
						id='choosePlayerId'
						placeholder='Masalan: 12345678'
						value={inputChooseId}
						onChange={e => setInputChooseId(e.target.value)}
						className='w-full p-3 rounded-lg text-base'
					/>

					<button
						id='updateButton'
						onClick={sendUpdate}
						disabled={!wsStatus || !playerData.groupId}
						className='btn w-full p-3 mt-4 rounded-lg font-bold'
					>
						✅ Serverga yuborish (
						{!playerData.groupId
							? 'Guruhsiz'
							: wsStatus
							? 'Ulangan'
							: 'Uzilgan'}
						)
					</button>
				</div>
			)}

			{/* Guruh holati (WebSocket real vaqtda) */}
			{playerData?.groupId && (
				<div id='groupSection' className='card p-4'>
					<h3 className='text-lg font-semibold border-b border-tg-border-color pb-2 mb-3'>
						Guruh holati (real vaqtda)
					</h3>
					<pre id='groupData' className='p-3 rounded-lg overflow-auto max-h-64'>
						{groupData}
					</pre>
				</div>
			)}

			{/* Loglar */}
			<div id='logSection' className='card p-4'>
				<h3 className='text-lg font-semibold border-b border-tg-border-color pb-2 mb-3'>
					Loglar va Xatolar
				</h3>
				<pre
					id='logList'
					ref={logListElRef}
					className='p-3 rounded-lg max-h-64 overflow-y-scroll text-xs'
				>
					{logList.map((log, index) => (
						<div
							key={index}
							className={log.type === 'error' ? 'log-error' : ''}
						>
							{log.message}
						</div>
					))}
				</pre>
			</div>
		</div>
	)
}

export default App
