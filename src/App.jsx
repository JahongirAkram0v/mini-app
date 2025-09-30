import { useCallback, useEffect, useRef, useState } from 'react'
// Eslatma: 'lucide-react' kutubxonasiga bo'lgan bog'liqlik olib tashlandi,
// Uning o'rniga inline SVG va Emoji (unicode) belgilari ishlatilmoqda.

// --- MUHIM ESLATMA ---
// Ushbu ilova global o'zgaruvchilar sifatida SockJS va Stomp kutubxonalarining mavjudligiga tayanadi.
// Ular HTML faylida quyidagi kabi yuklangan bo'lishi kerak:
// <script src="https://cdn.jsdelivr.net/npm/sockjs-client@1/dist/sockjs.min.js"></script>
// <script src="https://cdnjs.cloudflare.com/ajax/libs/stomp.js/2.3.3/stomp.min.js"></script>

function App() {
	// --- KONFIGURATSIYA (O'zgartirish kerak) ---
	// Ngrok manzilini doimiy ravishda yangilab turishingiz kerak!
	const BACKEND_URL = 'https://adc574bf3a73.ngrok-free.app' // <--- BU MANZILNI YANGILASH SHART!

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
	// TWA obyekti mavjudligini tekshirish
	const tgRef = useRef(
		window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null
	)
	const logListElRef = useRef(null) // Loglar uchun elementga murojaat

	// --- YORDAMCHI FUNKSIYALAR ---

	// Konsol loglari o'rniga ishlatiladigan funksiya
	const customLog = useCallback((message, type = 'log') => {
		const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false })
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
		(groupId, retryCount = 0) => {
			if (!groupId) {
				customLog(
					"Guruh ID mavjud emas. WebSocket ga ulanib bo'lmadi.",
					'error'
				)
				return
			}

			if (stompClientRef.current && stompClientRef.current.connected) {
				customLog('WebSocket allaqachon ulangan.')
				return
			}

			// Retry mexanizmi
			if (retryCount > 0) {
				customLog(`Qayta ulanishga urinish #${retryCount}...`, 'log')
			}

			customLog(
				`Guruh ID (${groupId}) uchun WebSocket ulanishga urinilmoqda...`
			)
			updateWebsocketStatus(false)
			setGroupData(
				"WebSocket orqali guruh ma'lumotlariga ulanishga urinilmoqda..."
			)

			// Stomp va SockJS global ravishda mavjudligini tekshirish
			if (
				typeof window.SockJS === 'undefined' ||
				typeof window.Stomp === 'undefined'
			) {
				customLog(
					'❌ SockJS yoki Stomp kutubxonalari topilmadi. Iltimos, HTML da script taglarini tekshiring.',
					'error'
				)
				setError('Xato: WebSocket kutubxonalari (SockJS/Stomp) yuklanmagan.')
				return
			}

			try {
				const BACKEND_URL = BACKEND_URL.replace('https://', 'ws://')
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
								// O'yinchi holatini yangilash
								const currentChatId = currentChatIdRef.current
								const player = data.players.find(
									p => p.chatId === currentChatId
								)
								if (player) {
									setInputState(player.playerState)
								}
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

						// Qayta urinish (max 5 marta)
						if (retryCount < 5) {
							setTimeout(
								() => connectSocket(groupId, retryCount + 1),
								5000 * (retryCount + 1)
							)
						} else {
							tgRef.current?.showAlert(
								'Server bilan aloqa uzildi. Iltimos, sahifani yangilang.'
							)
						}
					}
				)

				// SockJS ulanish uzilganda (kutilmaganda)
				socket.onclose = () => {
					customLog('WebSocket aloqasi kutilmaganda uzildi.')
					updateWebsocketStatus(false)
					// Avtomatik qayta ulanishga urinish
					if (currentGroupIdRef.current) {
						setTimeout(() => connectSocket(currentGroupIdRef.current, 1), 5000)
					}
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

			if (!chatId) {
				setError('Xato: Chat ID mavjud emas. Ilovani Telegram orqali oching.')
				setLoading(false)
				return
			}

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
						errorDetails = `Server xatosi (${status}): Kutilmagan javob formati.`
						console.error(
							'Serverdan kelgan kutilmagan javob:',
							await response.text()
						)
					}
					throw new Error(errorDetails)
				}

				const data = await response.json()
				setPlayerData(data)
				currentGroupIdRef.current = data.groupId
				// inputStateni faqat yuklashda playerData.playerState ga o'rnatamiz
				// WebSocket orqali keladigan yangilanishlar uni o'zgartiradi
				setInputState(data.playerState)

				customLog(`O'yinchi ma'lumotlari yuklandi. Guruh ID: ${data.groupId}`)
			} catch (err) {
				let errorMessage = err.message.includes('Failed to fetch')
					? 'Tarmoq ulanishida muammo yoki Ngrok tuneli yopilgan. Iltimos, aloqani tekshiring va sahifani yangilang.'
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
		const tg = tgRef.current

		if (!client || !client.connected) {
			tg?.HapticFeedback.notificationOccurred('error')
			tg?.showAlert(
				"❌ Server bilan aloqa yo'q (WebSocket uzilgan). Iltimos, qayta ulanishni kuting."
			)
			customLog("Ma'lumot yuborish rad etildi: WebSocket uzilgan.", 'error')
			return
		}

		if (!chatId || !groupId) {
			tg?.HapticFeedback.notificationOccurred('error')
			tg?.showAlert('❌ Chat ID yoki Guruh ID mavjud emas. Yuklashni kuting.')
			customLog("Ma'lumot yuborish rad etildi: IDlar mavjud emas.", 'error')
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
			groupState: null, // Backend tomonidan boshqariladi
		}

		customLog(`Serverga yuborilmoqda: ${JSON.stringify(payload)}`)

		try {
			client.send('/app/game.send', {}, JSON.stringify(payload))
			tg?.HapticFeedback.notificationOccurred('success')
			// Foydalanuvchi tanlagan holatni UI da yangilash uchun setPlayerData ni chaqirishning hojati yo'q.
			// WebSocket orqali keladigan real-time ma'lumot buni qiladi.
			customLog("Ma'lumot muvaffaqiyatli yuborildi.")
		} catch (e) {
			customLog(`STOMP xabarini yuborishda xatolik: ${e.message}`, 'error')
			tg?.HapticFeedback.notificationOccurred('error')
			tg?.showAlert("❌ Ma'lumotni yuborishda xatolik yuz berdi.")
		}
	}, [customLog, inputState, inputChooseId])

	// --- REACT LIFECYCLE HOOKLARI ---

	// 1. Telegram WebApp ni ishga tushirish va foydalanuvchi ma'lumotlarini olish
	useEffect(() => {
		const tg = tgRef.current

		if (!tg) {
			setError(
				'Xato: Telegram Web App obyekti (window.Telegram.WebApp) topilmadi. Ilovani faqat Telegram orqali oching.'
			)
			setLoading(false)
			customLog('Telegram Web App obyekti topilmadi.', 'error')
			return
		}

		tg.ready()
		tg.expand()
		customLog('Telegram Web App tayyorlandi va kengaytirildi.')

		const user = tg.initDataUnsafe?.user
		// User ID ni olish
		const userId = user?.id

		if (userId) {
			currentChatIdRef.current = userId
			customLog(
				`Foydalanuvchi ID (Chat ID) muvaffaqiyatli olindi: ${currentChatIdRef.current}`
			)
			fetchPlayerData(userId)
		} else {
			setError(
				"Xatolik: Foydalanuvchi ma'lumotlari topilmadi. Ilovani Telegram orqali oching."
			)
			customLog('Telegram user data topilmadi.', 'error')
			setLoading(false)
		}
	}, [customLog, fetchPlayerData]) // Bir marta ishga tushadi

	// 2. Guruh ID mavjud bo'lsa WebSocket ga ulanish
	useEffect(() => {
		if (playerData?.groupId && !stompClientRef.current) {
			connectSocket(playerData.groupId)
		}

		// Cleanup funksiyasi: komponent o'chirilganda yoki ID o'zgarganda WebSocket ni uzish
		return () => {
			const client = stompClientRef.current
			if (client && client.connected) {
				try {
					client.disconnect(() => {
						customLog('WebSocket ulanishi tozalash orqali uzildi.')
					})
				} catch {
					customLog('WebSocket ulanishni uzishda xatolik yuz berdi.', 'error')
				}
			}
			stompClientRef.current = null
		}
	}, [playerData?.groupId, connectSocket, customLog])

	// Loglar yangilanganda avtomatik pastga skroll qilish
	useEffect(() => {
		if (logListElRef.current) {
			logListElRef.current.scrollTop = logListElRef.current.scrollHeight
		}
	}, [logList])

	// --- UI YORDAMCHI KOMPONENTLARI ---

	// Holat uchun rangli yorliq
	const StatusBadge = ({ state }) => {
		const base =
			'inline-block py-1 px-3 rounded-full text-white font-medium text-xs shadow-md'
		const classes =
			{
				WAITING: 'status-WAITING',
				READY: 'status-READY',
				PLAYING: 'status-PLAYING',
				IN_GAME: 'status-IN_GAME',
				LOSE: 'status-LOSE',
				WIN: 'status-WIN',
				default: 'bg-gray-500',
			}[state] || 'bg-gray-500'

		return <span className={`${base} ${classes}`}>{state}</span>
	}

	// Ikonani almashtirish funksiyasi (inline SVG)
	const RefreshIcon = ({ className }) => (
		<svg
			xmlns='http://www.w3.org/2000/svg'
			width='24'
			height='24'
			viewBox='0 0 24 24'
			fill='none'
			stroke='currentColor'
			strokeWidth='2'
			strokeLinecap='round'
			strokeLinejoin='round'
			className={className}
		>
			<path d='M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-7.3 3.3L3 9' />
			<path d='M3 3v6h6' />
			<path d='M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 7.3-3.3L21 15' />
			<path d='M21 21v-6h-6' />
		</svg>
	)

	// Ikona (inline SVG)
	const SendIcon = ({ className }) => (
		<svg
			xmlns='http://www.w3.org/2000/svg'
			width='24'
			height='24'
			viewBox='0 0 24 24'
			fill='none'
			stroke='currentColor'
			strokeWidth='2'
			strokeLinecap='round'
			strokeLinejoin='round'
			className={className}
		>
			<path d='m22 2-7 20-4-9-9-4Z' />
			<path d='M22 2 11 13' />
		</svg>
	)

	// --- RENDER QISMI ---

	// Telegram ranglari uchun uslublar
	const tgThemeCSS = `
        :root {
            --tg-bg-color: ${tgRef.current?.themeParams?.bg_color || '#f9fafb'};
            --tg-text-color: ${
							tgRef.current?.themeParams?.text_color || '#1c1c1c'
						};
            --tg-hint-color: ${
							tgRef.current?.themeParams?.hint_color || '#999'
						};
            --tg-button-color: ${
							tgRef.current?.themeParams?.button_color || '#007BFF'
						};
            --tg-button-text-color: ${
							tgRef.current?.themeParams?.button_text_color || '#ffffff'
						};
            --tg-secondary-bg-color: ${
							tgRef.current?.themeParams?.secondary_bg_color || '#ffffff'
						};
            --tg-link-color: ${
							tgRef.current?.themeParams?.link_color || '#3390ec'
						};
            --tg-border-color: rgba(0,0,0,0.1);
        }

        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            background-color: var(--tg-bg-color);
            color: var(--tg-text-color);
        }

        .card {
            background: var(--tg-secondary-bg-color);
            border-radius: 12px;
            padding: 1rem;
            box-shadow: 0 4px 12px rgba(0,0,0,0.08);
        }

        input, select, pre {
            border: 1px solid var(--tg-hint-color);
            background: var(--tg-bg-color);
            color: var(--tg-text-color);
            border-radius: 8px;
        }

        pre {
            background-color: var(--tg-bg-color);
            border: 1px solid var(--tg-border-color);
        }
        
        .btn {
             background: var(--tg-button-color);
             color: var(--tg-button-text-color);
             transition: all 0.2s ease;
             border-radius: 8px;
             font-weight: 600;
        }
        .btn:hover:not(:disabled) {
            opacity: 0.9;
            box-shadow: 0 4px 8px rgba(var(--tg-button-color-rgb-r, 0), var(--tg-button-color-rgb-g, 123), var(--tg-button-color-rgb-b, 255), 0.3);
        }
        .btn:disabled {
            background-color: var(--tg-hint-color);
            cursor: not-allowed;
            opacity: 0.7;
            box-shadow: none;
        }
        
        /* Holat ranglari uchun sinflar */
        .status-WAITING { background-color: #f39c12; }
        .status-READY { background-color: #2ecc71; }
        .status-PLAYING { background-color: #3498db; }
        .status-IN_GAME { background-color: #1abc9c; }
        .status-LOSE { background-color: #e74c3c; }
        .status-WIN { background-color: #008000; }
        
        .log-error {
            color: #c62828;
            font-weight: 500;
        }
    `

	return (
		<div className='p-4 md:p-6 flex flex-col gap-5 min-h-screen'>
			<style>{tgThemeCSS}</style>

			<h1 className='text-xl font-extrabold text-center text-tg-text-color'>
				🎮 O'YIN PANELINI BOSHQARISH
			</h1>

			{/* Global holat xabarlari */}
			{(loading || error) && (
				<div
					className={`p-4 rounded-xl font-medium text-center shadow-lg ${
						error ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
					}`}
				>
					{loading ? "⏳ O'yinchi ma'lumotlari yuklanmoqda..." : `❌ ${error}`}
				</div>
			)}

			{/* O'yinchi Ma'lumotlari */}
			{playerData && (
				<div id='playerCard' className='card'>
					<h3 className='text-lg font-semibold border-b border-tg-border-color pb-3 mb-4 flex justify-between items-center'>
						Sizning ma'lumotingiz{' '}
						<span className='w-5 h-5 text-tg-hint-color'>🔗</span>{' '}
						{/* LogOut o'rniga */}
					</h3>

					<div
						id='websocketStatus'
						className={`p-2 rounded-lg font-bold mb-3 text-sm text-center transition-colors duration-300 ${
							wsStatus
								? 'bg-green-100 text-green-700'
								: 'bg-red-100 text-red-700'
						}`}
					>
						<span className='inline w-4 h-4 mr-1 mb-0.5'>🔥</span>
						WebSocket: {wsStatus ? 'Ulangan ✅' : 'Uzilgan ❌'}
					</div>

					<div id='playerInfo' className='text-sm leading-relaxed'>
						<p className='mb-1'>
							<strong>Chat ID:</strong> {playerData.chatId}
						</p>
						<p className='mb-1'>
							<strong>Guruh ID:</strong>{' '}
							{playerData.groupId ?? 'Guruhga qo‘shilmagan'}
						</p>
						<p className='flex items-center'>
							<strong className='mr-2'>Holati:</strong>
							<StatusBadge state={playerData.playerState} />
						</p>
					</div>
				</div>
			)}

			{/* O'yinni Boshqarish */}
			{playerData && (
				<div id='editSection' className='card'>
					<h3 className='text-lg font-semibold border-b border-tg-border-color pb-3 mb-4'>
						O'yinni Boshqarish
					</h3>

					<label
						htmlFor='playerState'
						className='block text-sm mb-2 font-medium text-tg-text-color'
					>
						Holatni o'zgartirish:
					</label>
					<select
						id='playerState'
						value={inputState}
						onChange={e => setInputState(e.target.value)}
						className='w-full p-3 mb-4 text-base focus:border-tg-link-color focus:ring-1 focus:ring-tg-link-color appearance-none'
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
						className='block text-sm mb-2 font-medium text-tg-text-color'
					>
						O'yinchi ID'sini tanlash (ixtiyoriy):
					</label>
					<input
						type='number'
						id='choosePlayerId'
						placeholder='Masalan: 12345678'
						value={inputChooseId}
						onChange={e => setInputChooseId(e.target.value)}
						className='w-full p-3 text-base focus:border-tg-link-color focus:ring-1 focus:ring-tg-link-color'
					/>

					<button
						id='updateButton'
						onClick={sendUpdate}
						disabled={!wsStatus || !playerData.groupId}
						className='btn w-full p-3 mt-5 shadow-lg flex items-center justify-center'
					>
						<SendIcon className='w-5 h-5 mr-2' /> {/* Send o'rniga */}
						Serverga yuborish (
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
				<div id='groupSection' className='card'>
					<h3 className='text-lg font-semibold border-b border-tg-border-color pb-3 mb-4 flex justify-between items-center'>
						Guruh holati (real vaqtda){' '}
						<span className='w-5 h-5 text-green-500'>⚡️</span>{' '}
						{/* Zap o'rniga */}
					</h3>

					<pre
						id='groupData'
						className='p-3 rounded-lg overflow-auto max-h-64 text-xs'
					>
						{groupData}
					</pre>
				</div>
			)}

			{/* Loglar */}
			<div id='logSection' className='card'>
				<h3 className='text-lg font-semibold border-b border-tg-border-color pb-3 mb-4 flex justify-between items-center'>
					Loglar va Xatolar{' '}
					<RefreshIcon className='w-4 h-4 text-tg-hint-color' />{' '}
					{/* RefreshCw o'rniga */}
				</h3>

				<pre
					id='logList'
					ref={logListElRef}
					className='p-3 rounded-lg max-h-48 overflow-y-scroll text-xs leading-normal'
				>
					{logList.length === 0 ? (
						<span className='text-tg-hint-color'>
							Faoliyat loglari shu yerda ko'rinadi...
						</span>
					) : (
						logList.map((log, index) => (
							<div
								key={index}
								className={
									log.type === 'error' ? 'log-error' : 'text-tg-text-color'
								}
							>
								{log.message}
							</div>
						))
					)}
				</pre>
			</div>
		</div>
	)
}

export default App
