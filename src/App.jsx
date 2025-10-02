import { useCallback, useEffect, useRef, useState } from 'react'

// --- MUHIM ESLATMA ---
// Ushbu ilova global o'zgaruvchilar sifatida SockJS va Stomp kutubxonalarining mavjudligiga tayanadi.
// Ular HTML faylida quyidagi kabi yuklangan bo'lishi kerak:
// <script src="https://cdn.jsdelivr.net/npm/sockjs-client@1/dist/sockjs.min.js"></script>
// <script src="https://cdnjs.cloudflare.com/ajax/libs/stomp.js/2.3.3/stomp.min.js"></script>

function App() {
	// --- KONFIGURATSIYA (O'zgartirish kerak) ---
	// Ngrok manzilini doimiy ravishda yangilab turishingiz kerak!
	const BACKEND_URL = 'https://0e73eee72904.ngrok-free.app' // <--- BU MANZILNI YANGILASH SHART!

	// --- HOLATNI BOSHQARISH (STATE MANAGEMENT) ---
	const [playerData, setPlayerData] = useState(null)
	const [loading, setLoading] = useState(false) // Boshlang'ich holatda yuklanmaydi
	const [error, setError] = useState(null)
	const [logList, setLogList] = useState([])
	const [wsStatus, setWsStatus] = useState(false) // WebSocket ulanish holati
	const [groupData, setGroupData] = useState('Ulanish kutilmoqda...')
	const [inputState, setInputState] = useState('WAITING')
	const [inputChooseId, setInputChooseId] = useState('')
	const [manualChatId, setManualChatId] = useState('')

	// --- MUTABLE O'ZGARUVCHILAR (useRef) ---
	const stompClientRef = useRef(null)
	const currentChatIdRef = useRef(null)
	const currentGroupIdRef = useRef(null)
	const logListElRef = useRef(null) // Loglar uchun elementga murojaat

	// --- YORDAMCHI FUNKSIYALAR ---

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

	// Boshqa yordamchi funksiyalar (o'zgarishsiz qoladi) ...
	// ... updateWebsocketStatus, connectSocket, fetchPlayerData, sendUpdate ...

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

	const MAX_RETRIES = 5

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

			customLog(
				`Guruh ID (${groupId}) uchun WebSocket ulanishga urinilmoqda...`
			)
			updateWebsocketStatus(false)
			setGroupData(
				"WebSocket orqali guruh ma'lumotlariga ulanishga urinilmoqda..."
			)

			if (
				typeof window.SockJS === 'undefined' ||
				typeof window.Stomp === 'undefined'
			) {
				customLog('❌ SockJS yoki Stomp kutubxonalari topilmadi.', 'error')
				setError('Xato: WebSocket kutubxonalari yuklanmagan.')
				return
			}

			try {
				const sockjsEndpoint = `${BACKEND_URL}/ws`
				customLog(`SockJS uchun yakuniy manzil: ${sockjsEndpoint}`, 'log')

				const socket = new window.SockJS(sockjsEndpoint, null, {
					transports: ['websocket', 'xhr-streaming', 'xhr-polling'],
				})

				const client = window.Stomp.over(socket)
				client.debug = null

				client.connect(
					{},
					() => {
						stompClientRef.current = client
						updateWebsocketStatus(true)
						customLog(
							`Serverga muvaffaqiyatli ulangan (Qayta urinish soni: ${retryCount})`
						)

						client.subscribe(`/topic/room/${groupId}`, message => {
							customLog(`Yangi xabar keldi: ${message.body}`, 'log')
							try {
								const data = JSON.parse(message.body)
								setGroupData(JSON.stringify(data, null, 2))

								if (data.players && Array.isArray(data.players)) {
									const updatedPlayer = data.players.find(
										p => p.chatId === currentChatIdRef.current
									)
									if (updatedPlayer) {
										setPlayerData(prevData => ({
											...prevData,
											playerState: updatedPlayer.playerState,
										}))
										customLog(
											`Sizning holatingiz yangilandi: ${updatedPlayer.playerState}`
										)
									}
								}
							} catch (e) {
								customLog(
									`Xabarni qayta ishlashda xatolik: ${e.message}`,
									'error'
								)
							}
						})
					},
					error => {
						customLog(
							`WebSocket ulanishda xatolik: ${error.message || error}`,
							'error'
						)
						updateWebsocketStatus(false)

						if (retryCount < MAX_RETRIES) {
							const nextRetryCount = retryCount + 1
							const delay = 2000 * Math.pow(2, retryCount)

							customLog(
								`Qayta ulanishga urinish (${nextRetryCount}/${MAX_RETRIES}) ${
									delay / 1000
								} soniyadan keyin...`
							)

							setTimeout(() => {
								connectSocket(groupId, nextRetryCount)
							}, delay)
						} else {
							customLog(
								'❌ Maksimal qayta ulanish urinishlari tugadi. Server bilan aloqa tiklanmadi.',
								'error'
							)
							setError(
								'Server bilan aloqa uzildi. Iltimos, sahifani yangilang.'
							)
						}
					}
				)

				socket.onclose = () => {
					customLog('WebSocket aloqasi kutilmaganda uzildi.')
					updateWebsocketStatus(false)
					connectSocket(groupId, 0)
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

	const fetchPlayerData = useCallback(
		async chatId => {
			setError(null)
			setLoading(true)

			if (!chatId) {
				setError('Xato: Chat ID mavjud emas. Iltimos, ID kiriting.')
				setLoading(false)
				return
			}

			customLog(
				`API orqali o'yinchi ma'lumotlarini yuklash: ${BACKEND_URL}/player/${chatId}`
			)

			try {
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

	const sendUpdate = useCallback(() => {
		const client = stompClientRef.current
		const chatId = currentChatIdRef.current
		const groupId = currentGroupIdRef.current

		if (!client || !client.connected) {
			alert(
				"❌ Server bilan aloqa yo'q (WebSocket uzilgan). Iltimos, qayta ulanishni kuting."
			)
			customLog("Ma'lumot yuborish rad etildi: WebSocket uzilgan.", 'error')
			return
		}

		if (!chatId || !groupId) {
			alert('❌ Chat ID yoki Guruh ID mavjud emas. Yuklashni kuting.')
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
			customLog("Ma'lumot muvaffaqiyatli yuborildi.")
		} catch (e) {
			customLog(`STOMP xabarini yuborishda xatolik: ${e.message}`, 'error')
			alert("❌ Ma'lumotni yuborishda xatolik yuz berdi.")
		}
	}, [customLog, inputState, inputChooseId])

	const handleConnect = useCallback(() => {
		const trimmedId = manualChatId.trim()
		if (!trimmedId) {
			setError('Iltimos, test uchun Chat ID kiriting.')
			customLog('Ulanishda xato: Chat ID kiritilmagan.', 'error')
			return
		}
		const numericId = parseInt(trimmedId, 10)
		currentChatIdRef.current = numericId
		fetchPlayerData(numericId)
	}, [manualChatId, customLog, fetchPlayerData])

	// --- REACT LIFECYCLE HOOKLARI ---

	// Telegram bilan bog'liq useEffect olib tashlandi

	useEffect(() => {
		if (playerData?.groupId && !stompClientRef.current) {
			connectSocket(playerData.groupId)
		}

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

	useEffect(() => {
		if (logListElRef.current) {
			logListElRef.current.scrollTop = logListElRef.current.scrollHeight
		}
	}, [logList])

	// --- UI YORDAMCHI KOMPONENTLARI (o'zgarishsiz) ---
	// ... StatusBadge, RefreshIcon, SendIcon ...
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

	const tgThemeCSS = `
        :root {
            --tg-bg-color: #f9fafb;
            --tg-text-color: #1c1c1c;
            --tg-hint-color: #999;
            --tg-button-color: #007BFF;
            --tg-button-text-color: #ffffff;
            --tg-secondary-bg-color: #ffffff;
            --tg-link-color: #3390ec;
            --tg-border-color: rgba(0,0,0,0.1);
        }

        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            background-color: var(--tg-bg-color);
            color: var(--tg-text-color);
        }
        /* Boshqa stillar o'zgarishsiz qoladi */
        .card { background: var(--tg-secondary-bg-color); border-radius: 12px; padding: 1rem; box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
        input, select, pre { border: 1px solid var(--tg-hint-color); background: var(--tg-bg-color); color: var(--tg-text-color); border-radius: 8px; }
        pre { background-color: var(--tg-bg-color); border: 1px solid var(--tg-border-color); }
        .btn { background: var(--tg-button-color); color: var(--tg-button-text-color); transition: all 0.2s ease; border-radius: 8px; font-weight: 600; }
        .btn:hover:not(:disabled) { opacity: 0.9; }
        .btn:disabled { background-color: var(--tg-hint-color); cursor: not-allowed; opacity: 0.7; }
        .status-WAITING { background-color: #f39c12; }
        .status-READY { background-color: #2ecc71; }
        .status-PLAYING { background-color: #3498db; }
        .status-IN_GAME { background-color: #1abc9c; }
        .status-LOSE { background-color: #e74c3c; }
        .status-WIN { background-color: #008000; }
        .log-error { color: #c62828; font-weight: 500; }
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

			{/* ID kiritish bloki endi doim birinchi ko'rinadi */}
			{!playerData && !loading && (
				<div id='manualConnectCard' className='card'>
					<h3 className='text-lg font-semibold border-b border-tg-border-color pb-3 mb-4'>
						Foydalanuvchi orqali ulanish
					</h3>
					<p className='text-sm text-tg-hint-color mb-3'>
						O'yinchi ma'lumotlarini yuklash uchun uning Chat ID'sini kiriting.
					</p>
					<div className='flex flex-col sm:flex-row gap-2'>
						<input
							type='number'
							placeholder='Chat ID kiriting...'
							value={manualChatId}
							onChange={e => setManualChatId(e.target.value)}
							className='flex-grow p-3 text-base focus:border-tg-link-color focus:ring-1 focus:ring-tg-link-color w-full'
						/>
						<button
							onClick={handleConnect}
							className='btn p-3 w-full sm:w-auto'
						>
							Ulanish
						</button>
					</div>
				</div>
			)}

			{/* Qolgan barcha qismlar `playerData` mavjud bo'lganda ko'rsatiladi */}
			{playerData && (
				<>
					{/* O'yinchi Ma'lumotlari */}
					<div id='playerCard' className='card'>
						<h3 className='text-lg font-semibold border-b border-tg-border-color pb-3 mb-4 flex justify-between items-center'>
							Sizning ma'lumotingiz
						</h3>

						<div
							id='websocketStatus'
							className={`p-2 rounded-lg font-bold mb-3 text-sm text-center transition-colors duration-300 ${
								wsStatus
									? 'bg-green-100 text-green-700'
									: 'bg-red-100 text-red-700'
							}`}
						>
							<span
								className='inline-block w-2 h-2 mr-2 rounded-full animate-pulse'
								style={{ backgroundColor: wsStatus ? '#2ecc71' : '#e74c3c' }}
							></span>
							WebSocket: {wsStatus ? 'Ulangan' : 'Uzilgan'}
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

					{/* O'yinni Boshqarish */}
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
							<SendIcon className='w-5 h-5 mr-2' />
							Serverga yuborish
						</button>
					</div>

					{/* Guruh holati (WebSocket real vaqtda) */}
					{playerData.groupId && (
						<div id='groupSection' className='card'>
							<h3 className='text-lg font-semibold border-b border-tg-border-color pb-3 mb-4 flex justify-between items-center'>
								Guruh holati (real vaqtda)
								<span className='text-green-500'>⚡️</span>
							</h3>
							<pre
								id='groupData'
								className='p-3 rounded-lg overflow-auto max-h-64 text-xs'
							>
								{groupData}
							</pre>
						</div>
					)}
				</>
			)}

			{/* Loglar */}
			<div id='logSection' className='card'>
				<h3 className='text-lg font-semibold border-b border-tg-border-color pb-3 mb-4 flex justify-between items-center'>
					Loglar va Xatolar
					<RefreshIcon className='w-4 h-4 text-tg-hint-color' />
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
