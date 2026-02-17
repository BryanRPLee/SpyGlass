import { CrawlStatus, PrismaClient } from '@prisma/client'
import { MatchHistoryService } from './matchHistoryService'
import { PlayerProfileService } from './playerProfileService'
import { MatchStorageService } from './matchStorageService'
import { PrismaService } from './prismaService'

export class ViralCrawlerService {
	private prisma: PrismaClient
	private matchHistoryService: MatchHistoryService
	private playerProfileService: PlayerProfileService
	private matchStorageService: MatchStorageService
	private isRunning = false
	private intervalMs: number
	private batchSize: number
	private maxRetries: number

	constructor(
		matchHistoryService: MatchHistoryService,
		playerProfileService: PlayerProfileService,
		intervalMs = 5000,
		batchSize = 5,
		maxRetries = 3
	) {
		this.prisma = PrismaService.getInstance()
		this.matchHistoryService = matchHistoryService
		this.playerProfileService = playerProfileService
		this.matchStorageService = new MatchStorageService()
		this.intervalMs = intervalMs
		this.batchSize = batchSize
		this.maxRetries = maxRetries
	}

	public async seed(steamIds: string[]) {
		console.log(`Seeding crawler with ${steamIds.length} player(s)`)

		for (const steamId of steamIds) {
			await this.prisma.crawlQueue.upsert({
				where: { playerId: steamId },
				create: {
					playerId: steamId,
					priority: 100,
					status: CrawlStatus.PENDING
				},
				update: {
					priority: 100,
					status: CrawlStatus.PENDING
				}
			})

			await this.prisma.player.upsert({
				where: { id: steamId },
				create: {
					id: steamId
				},
				update: {
					lastSeen: new Date()
				}
			})
		}

		console.log(`Seeded ${steamIds.length} players to crawl queue`)
	}

	public async start() {
		if (this.isRunning) {
			console.log('Crawler is already running')
			return
		}

		this.isRunning = true
		console.log('Starting viral crawler...')
		this.crawlLoop()
	}

	public stop(): void {
		console.log('Stopping viral crawler...')
		this.isRunning = false
	}

	private async crawlLoop() {
		while (this.isRunning) {
			try {
				await this.processBatch()
				await this.logStats()
				await this.sleep(this.intervalMs)
			} catch (error) {
				console.error('Error in crawl loop:', error)
				await this.sleep(this.intervalMs * 2)
			}
		}
	}

	private async processBatch() {
		const tasks = await this.prisma.crawlQueue.findMany({
			where: {
				status: CrawlStatus.PENDING,
				attempts: { lt: this.maxRetries }
			},
			orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
			take: this.batchSize
		})

		if (tasks.length === 0) {
			console.log('No pending tasks, waiting...')
			return
		}

		console.log(`Processing batch of ${tasks.length} tasks`)

		for (const task of tasks) {
			try {
				await this.prisma.crawlQueue.update({
					where: { id: task.id },
					data: {
						status: CrawlStatus.IN_PROGRESS,
						attempts: { increment: 1 },
						lastAttempt: new Date()
					}
				})

				await this.crawlPlayer(task.playerId)

				await this.prisma.crawlQueue.update({
					where: { id: task.id },
					data: {
						status: CrawlStatus.COMPLETED
					}
				})

				console.log(`Completed crawl for player ${task.playerId}`)
			} catch (error: any) {
				console.error(
					`✗ Error crawling player ${task.playerId}:`,
					error.message
				)

				const isRateLimited =
					error.message?.includes('RATE') ||
					error.message?.includes('timeout')

				await this.prisma.crawlQueue.update({
					where: { id: task.id },
					data: {
						status: isRateLimited
							? CrawlStatus.RATE_LIMITED
							: task.attempts + 1 >= this.maxRetries
								? CrawlStatus.FAILED
								: CrawlStatus.PENDING,
						error: error.message
					}
				})

				if (isRateLimited) {
					console.log('Rate limited, backing off for 60s...')
					await this.sleep(60000)
				}
			}

			await this.sleep(8000)
		}
	}

	private async crawlPlayer(steamId: string) {
		console.log(`Crawling player ${steamId}...`)

		try {
			const profile =
				await this.playerProfileService.getPlayerProfile(steamId)
			if (profile) {
				await this.matchStorageService.storePlayerProfile(
					steamId,
					profile
				)
			}
		} catch (error) {
			console.warn(`Could not fetch profile for ${steamId}:`, error)
		}

		await this.sleep(10000)

		const matches =
			await this.matchHistoryService.getPlayerMatchHistory(steamId)

		console.log(`Found ${matches.length} matches for player ${steamId}`)

		for (const match of matches) {
			await this.matchStorageService.storeMatch(match, steamId)
		}

		await this.sleep(5000)
	}

	private async logStats(): Promise<void> {
		const [crawlStats, queueStats] = await Promise.all([
			this.matchStorageService.getCrawlStats(),
			this.prisma.crawlQueue.groupBy({
				by: ['status'],
				_count: true
			})
		])

		const queueSummary = queueStats.reduce(
			(acc, stat) => {
				acc[stat.status] = stat._count
				return acc
			},
			{} as Record<string, number>
		)

		console.log('=== Crawler Stats ===')
		console.log(`Total Players: ${crawlStats.totalPlayers}`)
		console.log(`Total Matches: ${crawlStats.totalMatches}`)
		console.log(
			`Avg Matches/Player: ${crawlStats.avgMatchesPerPlayer.toFixed(2)}`
		)
		console.log('Queue Status:', queueSummary)
		console.log('=====================')

		await this.prisma.crawlStats.create({
			data: {
				totalPlayers: crawlStats.totalPlayers,
				totalMatches: crawlStats.totalMatches,
				pendingCrawls: queueSummary[CrawlStatus.PENDING] || 0,
				failedCrawls: queueSummary[CrawlStatus.FAILED] || 0,
				avgMatchesPerPlayer: crawlStats.avgMatchesPerPlayer
			}
		})
	}

	private sleep(ms: number) {
		return new Promise((resolve) => setTimeout(resolve, ms))
	}
}
