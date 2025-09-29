import { useCallback, useEffect, useState } from 'react'

function App() {
	// Holat o'zgaruvchilari
	const [data, setData] = useState(null)
	const [loading, setLoading] = useState(false) // Yuklanish holati. Dastlab false
	const [error, setError] = useState(null)

	// Foydalanuvchi kiritayotgan ID
	const [inputPlayerId, setInputPlayerId] = useState('')
	// API so'rovi uchun ishlatiladigan tasdiqlangan ID
	const [activePlayerId, setActivePlayerId] = useState(null)

	/**
	 * Backendga ma'lumotlarni olish uchun asinxron funksiya.
	 * Bu funksiya faqatgina activePlayerId o'zgarganda useEffect orqali chaqiriladi.
	 */
	const fetchPlayerData = useCallback(async idToFetch => {
		setLoading(true)
		setError(null)
		setData(null)

		// Environment variable ni process.env orqali olish (kompilyatsiya xatosini tuzatish)
		const API_BASE_URL = 'https://f41ce2be4656.ngrok-free.app'

		if (!API_BASE_URL) {
			setError(
				"API_URL muhit o'zgaruvchisi topilmadi! .env faylini tekshiring."
			)
			setLoading(false)
			return
		}

		// To'liq URL manzilini tuzish, /api prefiksini kiritish (ko'pincha talab qilinadi)
		const apiUrl = `${API_BASE_URL}/api/player/${idToFetch}`

		console.log("Yuborilayotgan To'liq URL:", apiUrl)

		try {
			const response = await fetch(apiUrl, {
				method: 'GET',
				headers: new Headers({
					'ngrok-skip-browser-warning': '69420', // ngrok ogohlantirishini chetlab o'tish
					Accept: 'application/json', // JSON qabul qilishni so'rash
				}),
			})
			setData(response.data)
		} catch (err) {
			let errorMessage = "Noma'lum xatolik yuz berdi."
			if (err.response) {
				// Server javobi mavjud (masalan, 404, 500)
				errorMessage = `Server xatosi (${
					err.response.status
				}): ${JSON.stringify(err.response.data)}`
			} else if (err.request) {
				// Tarmoq xatosi (serverga ulanish yo'q)
				errorMessage = `Serverga ulanib bo'lmadi. Internet aloqasi yoki Ngrok tunelini tekshiring.`
			} else {
				errorMessage = err.message
			}
			setError(errorMessage)
		} finally {
			setLoading(false)
		}
	}, [])

	// activePlayerId o'zgarganda ma'lumotlarni avtomatik olish
	useEffect(() => {
		if (activePlayerId) {
			fetchPlayerData(activePlayerId)
		}
	}, [activePlayerId, fetchPlayerData])

	/**
	 * 'Qidirish' tugmasi bosilganda ishlaydigan funksiya
	 */
	const handleSearch = () => {
		const id = inputPlayerId.trim()
		const numericId = Number(id)

		if (!id) {
			setError("Iltimos, o'yinchi ID raqamini kiriting.")
			setActivePlayerId(null)
			setData(null)
		} else if (isNaN(numericId) || numericId <= 0) {
			setError("ID faqat musbat raqamlardan iborat bo'lishi kerak.")
			setActivePlayerId(null)
			setData(null)
		} else {
			// ID raqami to'g'ri, uni API chaqiruvi uchun o'rnatamiz
			setActivePlayerId(id)
		}
	}

	// UI render qismi
	return (
		<div
			style={{
				padding: '20px',
				wordBreak: 'break-all',
				fontFamily: 'Inter, sans-serif',
			}}
			className='bg-gray-50 dark:bg-gray-800 min-h-screen text-gray-900 dark:text-gray-100 transition-colors duration-300'
		>
			<style>
				{/* Tailwind CSS yuklanmaganligi sababli inline va standart CSS ishlatamiz */}
				{`
                .card {
                    background-color: ${
											window.Telegram &&
											window.Telegram.WebApp &&
											window.Telegram.WebApp.colorScheme === 'dark'
												? '#2c2c2e'
												: 'white'
										};
                    padding: 20px;
                    border-radius: 12px;
                    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                    margin-bottom: 20px;
                }
                pre {
                    background-color: ${
											window.Telegram &&
											window.Telegram.WebApp &&
											window.Telegram.WebApp.colorScheme === 'dark'
												? '#1c1c1e'
												: '#f0f0f0'
										};
                    padding: 10px;
                    border-radius: 6px;
                    overflow-x: auto;
                    font-size: 0.9em;
                }
                .search-input {
                    padding: 10px;
                    border-radius: 8px;
                    border: 1px solid #ccc;
                    width: 70%;
                    max-width: 250px;
                    margin-right: 10px;
                    background-color: inherit;
                    color: inherit;
                }
                .search-button {
                    padding: 10px 20px;
                    border-radius: 8px;
                    background-color: #4f46e5; /* Indigo */
                    color: white;
                    font-weight: bold;
                    transition: background-color 0.2s;
                    cursor: pointer;
                    border: none;
                }
                .search-button:hover {
                    background-color: #4338ca;
                }
                `}
			</style>

			<h1 className='text-xl font-bold mb-6 text-center'>
				O'yinchi Ma'lumotlarini ID orqali olish
			</h1>

			<div className='card flex flex-col items-center'>
				<h2 className='text-lg font-semibold mb-3 text-indigo-600 dark:text-indigo-400'>
					O'yinchi ID'sini kiriting:
				</h2>
				<div className='flex w-full justify-center'>
					<input
						type='number'
						placeholder='Telegram ID (masalan, 123456789)'
						value={inputPlayerId}
						onChange={e => setInputPlayerId(e.target.value)}
						className='search-input'
					/>
					<button
						onClick={handleSearch}
						className='search-button'
						disabled={loading}
					>
						{loading ? '...' : 'Qidirish'}
					</button>
				</div>
			</div>

			{loading && (
				<div className='card text-center'>
					<p className='text-lg'>⏳ Yuklanmoqda...</p>
				</div>
			)}

			{error && (
				<div className='card border-l-4 border-red-500 bg-red-100 dark:bg-red-900'>
					<h2 className='text-red-600 dark:text-red-400 font-semibold mb-2'>
						❌ Xatolik:
					</h2>
					<p className='text-red-800 dark:text-red-200 text-sm'>{error}</p>
				</div>
			)}

			{!loading && !error && activePlayerId && (
				<div className='card'>
					<h2 className='text-lg font-semibold mb-2 text-green-600 dark:text-green-400'>
						🚀 Backenddan kelgan ma'lumotlar:
					</h2>
					<p className='mb-2'>**Qidirilgan ID:** {activePlayerId}</p>
					{data ? (
						<pre>{JSON.stringify(data, null, 2)}</pre>
					) : (
						<p className='text-gray-500 dark:text-gray-400'>
							Ma'lumot topilmadi (Server 404 yoki bo'sh javob qaytargan bo'lishi
							mumkin). Ma'lumotlar bazangizni tekshiring.
						</p>
					)}
				</div>
			)}
		</div>
	)
}

export default App
