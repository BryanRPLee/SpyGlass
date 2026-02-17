import express, { Express } from 'express'
import { SteamClient } from './clients/steamClient'
import { MatchHistoryService } from './services/matchHistoryService'
import { Config } from './config/config'
import { errorHandler } from './middleware/errorHandler'
import { PlayerProfileService } from './services/playerProfileService'
import { MatchStorageService } from './services/matchStorageService'
import { ViralCrawlerService } from './services/viralCrawlerService'
import { PrismaService } from './services/prismaService'

export class Server {
	private app: Express
	private readonly steamClient: SteamClient
	private matchHistoryService: MatchHistoryService
	private playerProfileService: PlayerProfileService
	private matchStorageService: MatchStorageService
	private viralCrawlerService?: ViralCrawlerService
	private config: Config

	constructor() {
		this.app = express()
		this.config = Config.getInstance()
		this.steamClient = new SteamClient(
			this.config.steamUsername,
			this.config.steamPassword
		)
		this.matchHistoryService = new MatchHistoryService(this.steamClient)
		this.playerProfileService = new PlayerProfileService(this.steamClient)
		this.matchStorageService = new MatchStorageService()

		this.setupMiddleware()
		this.setupRoutes()
	}

	private setupMiddleware() {
		this.app.use(express.json())
		this.app.use(errorHandler)
	}

	private setupRoutes() {
		this.app.get('/health', (_, res) => {
			res.json({
				status: 'ok',
				connected: this.steamClient.isConnected()
			})
		})

		this.app.get('/api/players/:steamId', async (req, res) => {
			try {
				const { steamId } = req.params
				const profile =
					await this.playerProfileService.getPlayerProfile(steamId)

				if (!profile) {
					return res.status(404).json({
						success: false,
						error: 'Player profile not found'
					})
				}

				res.json({ success: true, steamId, profile })
			} catch (err) {
				res.status(500).json({
					success: false,
					error: err instanceof Error ? err.message : 'Unknown error'
				})
			}
		})

		this.app.get('/api/players/:steamId/matches/', async (req, res) => {
			try {
				const { steamId } = req.params
				const matches =
					await this.matchHistoryService.getPlayerMatchHistory(
						steamId
					)
				res.json({ success: true, steamId, matches })
			} catch (err) {
				res.status(500).json({
					success: false,
					error: err instanceof Error ? err.message : 'Unknown error'
				})
			}
		})

		this.app.get(
			'/api/players/:steamId/matches/:matchId',
			async (req, res) => {
				try {
					const { steamId, matchId } = req.params
					const matchDetails =
						await this.matchHistoryService.getMatchDetails(
							steamId,
							matchId
						)

					res.json({ success: true, matchId, matchDetails })
				} catch (err) {
					res.status(500).json({
						success: false,
						error:
							err instanceof Error ? err.message : 'Unknown error'
					})
				}
			}
		)

		this.app.post('/api/crawler/seed', async (req, res) => {
			try {
				const { steamIds } = req.body

				if (
					!Array.isArray(steamIds) ||
					steamIds.length === 0 ||
					!steamIds.every((id) => typeof id === 'string')
				) {
					return res.status(400).json({
						success: false,
						error: 'steamIds must be a non-empty array of strings'
					})
				}

				if (!this.viralCrawlerService) {
					return res.status(400).json({
						success: false,
						error: 'Crawler is not enabled'
					})
				}

				await this.viralCrawlerService.seed(steamIds)

				res.json({
					success: true,
					message: `Seeded ${steamIds.length} player(s)`
				})
			} catch (err) {
				res.status(500).json({
					success: false,
					error: err instanceof Error ? err.message : 'Unknown error'
				})
			}
		})

		this.app.get('/api/crawler/stats', async (req, res) => {
			try {
				const stats = await this.matchStorageService.getCrawlStats()

				res.json({
					success: true,
					stats
				})
			} catch (err) {
				res.status(500).json({
					success: false,
					error: err instanceof Error ? err.message : 'Unknown error'
				})
			}
		})

		this.app.post('/api/crawler/start', async (req, res) => {
			try {
				if (!this.viralCrawlerService) {
					this.viralCrawlerService = new ViralCrawlerService(
						this.matchHistoryService,
						this.playerProfileService,
						parseInt(process.env.CRAWLER_INTERVAL_MS || '5000', 10),
						parseInt(process.env.CRAWLER_BATCH_SIZE || '5', 10),
						parseInt(process.env.CRAWLER_MAX_RETRIES || '3', 10)
					)
				}

				await this.viralCrawlerService.start()

				res.json({
					success: true,
					message: 'Crawler started'
				})
			} catch (err) {}
		})

		this.app.post('/api/crawler/stop', async (req, res) => {
			try {
				if (!this.viralCrawlerService) {
					return res.status(400).json({
						success: false,
						error: 'Crawler is not running'
					})
				}

				this.viralCrawlerService.stop()

				res.json({
					success: true,
					message: 'Crawler stopped'
				})
			} catch (err) {
				res.status(500).json({
					success: false,
					error: err instanceof Error ? err.message : 'Unknown error'
				})
			}
		})

		this.app.post('/api/crawler/backfill', async (req, res) => {
			try {
				const { limit, priority } = req.body

				const processedPlayerIds =
					await PrismaService.getInstance().crawlQueue.findMany({
						where: {
							status: {
								in: ['COMPLETED', 'IN_PROGRESS', 'FAILED']
							}
						},
						select: { playerId: true }
					})

				const processedIds = processedPlayerIds.map((p) => p.playerId)

				const uncrawledPlayers =
					await PrismaService.getInstance().player.findMany({
						where: {
							id: {
								notIn:
									processedIds.length > 0
										? processedIds
										: ['']
							}
						},
						take: limit || 100,
						orderBy: {
							lastSeen: 'desc'
						}
					})

				let added = 0
				for (const player of uncrawledPlayers) {
					await PrismaService.getInstance().crawlQueue.upsert({
						where: { playerId: player.id },
						create: {
							playerId: player.id,
							priority: priority || 1,
							status: 'PENDING'
						},
						update: {
							status: 'PENDING',
							attempts: 0,
							error: null
						}
					})
					added++
				}

				res.json({
					success: true,
					message: `Added ${added} players to crawl queue`,
					playersFound: uncrawledPlayers.length
				})
			} catch (err) {
				res.status(500).json({
					success: false,
					error: err instanceof Error ? err.message : 'Unknown error'
				})
			}
		})

		this.app.post('/api/crawler/reset-stuck', async (req, res) => {
			try {
				const result =
					await PrismaService.getInstance().crawlQueue.updateMany({
						where: {
							status: 'IN_PROGRESS'
						},
						data: {
							status: 'PENDING',
							attempts: 0
						}
					})

				res.json({
					success: true,
					message: `Reset ${result.count} stuck tasks`,
					count: result.count
				})
			} catch (err) {
				res.status(500).json({
					success: false,
					error: err instanceof Error ? err.message : 'Unknown error'
				})
			}
		})
	}

	public async start() {
		try {
			await this.connectWithRetry()
			this.app.listen(this.config.port, async () => {
				console.log(`Server listening on port ${this.config.port}`)
				console.log(
					`Connected to Steam as: ${this.config.steamUsername}`
				)

				const crawlerEnabled = process.env.CRAWLER_ENABLED === 'true'
				if (crawlerEnabled) {
					console.log('Auto-starting crawler...')
					this.viralCrawlerService = new ViralCrawlerService(
						this.matchHistoryService,
						this.playerProfileService,
						parseInt(process.env.CRAWLER_INTERVAL_MS || '5000', 10),
						parseInt(process.env.CRAWLER_BATCH_SIZE || '5', 10),
						parseInt(process.env.CRAWLER_MAX_RETRIES || '3', 10)
					)
					await this.viralCrawlerService.start()
				}
			})
		} catch (err) {
			console.error('Failed to start server:', err)
			process.exit(1)
		}
	}

	private async connectWithRetry(maxRetries = 3) {
		for (let attempt = 1; attempt <= maxRetries; attempt++) {
			try {
				console.log(`Connection attempt ${attempt}/${maxRetries}...`)
				await this.steamClient.connect()
				console.log('Successfully connected to Steam and GC')
				return
			} catch (err: any) {
				console.error(
					`Connection attempt ${attempt} failed:`,
					err.message
				)

				if (err.eresult === 84) {
					console.error(
						'Rate limited by Steam. Please wait at least 30 minutes.'
					)
					console.error(
						'The saved session will be used next time to avoid this.'
					)
					throw err
				}

				if (attempt < maxRetries) {
					const delay = 5000 * attempt
					console.log(`Waiting ${delay / 1000}s before retry...`)
					await new Promise((resolve) => setTimeout(resolve, delay))
				} else {
					throw new Error(
						`Failed to connect after ${maxRetries} attempts`
					)
				}
			}
		}
	}

	public async stop() {
		console.log('Stopping server...')

		if (this.viralCrawlerService) {
			this.viralCrawlerService.stop()
		}

		await PrismaService.disconnect()
		await this.steamClient.disconnect()

		console.log('Server stopped')
	}
}
