import { Player, PrismaClient } from '@prisma/client'
import { PrismaService } from './prismaService'
import { Match } from '../models/match'

export class MatchStorageService {
	private prisma: PrismaClient

	constructor() {
		this.prisma = PrismaService.getInstance()
	}

	public async storeMatch(match: Match, steamId: string) {
		const matchId = match.matchid

		const existing = await this.prisma.match.findUnique({
			where: { id: matchId }
		})
		if (existing) {
			console.log(`Match ${matchId} already exists, skipping`)
			return
		}

		const playerIds = this.extractPlayerIds(match)
		const demoFileUrl = this.extractDemoFileUrl(match)

		await this.prisma.$transaction(async (tx) => {
			for (const playerId of playerIds) {
				await tx.player.upsert({
					where: { id: playerId },
					create: {
						id: playerId,
						discoveredFromId: steamId
					},
					update: {
						lastSeen: new Date()
					}
				})
			}

			const prismaMatch = await tx.match.create({
				data: {
					id: matchId,
					matchTime: new Date(match.matchtime * 1000),
					map: match.roundstatsall?.[0]?.map || null,
					duration:
						match.roundstatsall?.[match.roundstatsall.length - 1]
							?.match_duration || null,
					maxRounds:
						match.roundstatsall?.[match.roundstatsall.length - 1]
							?.max_rounds || null,
					serverIp: match.watchablematchinfo?.server_ip
						? BigInt(match.watchablematchinfo.server_ip)
						: null,
					tvPort: match.watchablematchinfo?.tv_port || null,
					gameType: match.watchablematchinfo?.game_type || null,
					demoFile: demoFileUrl,
					processed: true
				}
			})

			if (match.roundstatsall) {
				for (let i = 0; i < match.roundstatsall.length; i++) {
					const roundStat = match.roundstatsall[i]

					const round = await tx.round.create({
						data: {
							matchId: prismaMatch.id,
							roundNumber: i + 1,
							duration: roundStat.match_duration,
							map: roundStat.map,
							roundResult: roundStat.round_result,
							matchResult: roundStat.match_result,
							teamScores: roundStat.team_scores
								? JSON.stringify(roundStat.team_scores)
								: null
						}
					})

					if (roundStat.reservation?.account_ids) {
						for (
							let playerIndex = 0;
							playerIndex <
							roundStat.reservation.account_ids.length;
							playerIndex++
						) {
							const accountId =
								roundStat.reservation.account_ids[playerIndex]
							if (!accountId) continue

							const steamId64 =
								this.accountIdToSteamId64(accountId)

							await tx.roundPlayer.create({
								data: {
									roundId: round.id,
									playerId: steamId64,
									playerIndex,
									accountId: BigInt(accountId),
									kills: roundStat.kills?.[playerIndex] || 0,
									deaths:
										roundStat.deaths?.[playerIndex] || 0,
									assists:
										roundStat.assists?.[playerIndex] || 0,
									score: roundStat.scores?.[playerIndex] || 0,
									mvps: roundStat.mvps?.[playerIndex] || 0,
									headshots:
										roundStat.enemy_headshots?.[
											playerIndex
										] || 0,
									enemyKills:
										roundStat.enemy_kills?.[playerIndex] ||
										0
								}
							})
						}
					}
				}
			}

			const playerStats = this.calculatePlayerStats(match)
			for (const [playerId, stats] of Object.entries(playerStats)) {
				await tx.matchPlayer.create({
					data: {
						matchId: prismaMatch.id,
						playerId,
						slot: stats.slot,
						team: stats.team,
						kills: stats.kills,
						deaths: stats.deaths,
						assists: stats.assists,
						mvps: stats.mvps,
						score: stats.score
					}
				})

				await tx.player.update({
					where: { id: playerId },
					data: {
						totalMatches: { increment: 1 },
						totalKills: { increment: stats.kills },
						totalDeaths: { increment: stats.deaths },
						totalAssists: { increment: stats.assists },
						totalMvps: { increment: stats.mvps }
					}
				})
			}
		})

		console.log(`Stored match ${matchId} with ${playerIds.length} players`)
		if (demoFileUrl) {
			console.log(`Demo file: ${demoFileUrl}`)
		}
	}

	public async storePlayerProfile(steamId: string, profile: any) {
		const accountId = profile.account_id ? BigInt(profile.account_id) : null

		try {
			await this.prisma.player.upsert({
				where: { id: steamId },
				create: {
					id: steamId,
					accountId,
					playerLevel: profile.player_level,
					playerCurXp: profile.player_cur_xp,
					vacBanned: profile.vac_banned || false,
					penaltySeconds: profile.penalty_seconds,
					penaltyReason: profile.penalty_reason
				},
				update: {
					accountId,
					playerLevel: profile.player_level,
					playerCurXp: profile.player_cur_xp,
					vacBanned: profile.vac_banned || false,
					penaltySeconds: profile.penalty_seconds,
					penaltyReason: profile.penalty_reason,
					lastSeen: new Date()
				}
			})
		} catch (error: any) {
			if (error.code === 'P2002' && error.meta?.modelName === 'Player') {
				console.warn(
					`accountId conflict for ${steamId}, storing without accountId`
				)

				await this.prisma.player.upsert({
					where: { id: steamId },
					create: {
						id: steamId,
						accountId: null,
						playerLevel: profile.player_level,
						playerCurXp: profile.player_cur_xp,
						vacBanned: profile.vac_banned || false,
						penaltySeconds: profile.penalty_seconds,
						penaltyReason: profile.penalty_reason
					},
					update: {
						playerLevel: profile.player_level,
						playerCurXp: profile.player_cur_xp,
						vacBanned: profile.vac_banned || false,
						penaltySeconds: profile.penalty_seconds,
						penaltyReason: profile.penalty_reason,
						lastSeen: new Date()
					}
				})
			} else {
				throw error
			}
		}
	}

	public async getUndiscoveredPlayers(limit: number): Promise<Player[]> {
		const crawledPlayerIds = await this.prisma.crawlQueue.findMany({
			where: {
				status: {
					in: ['COMPLETED', 'IN_PROGRESS']
				}
			},
			select: { playerId: true }
		})
		const crawledIds = crawledPlayerIds.map((p) => p.playerId)

		return this.prisma.player.findMany({
			where: {
				id: {
					notIn: crawledIds.length > 0 ? crawledIds : ['']
				}
			},
			orderBy: {
				createdAt: 'asc'
			},
			take: limit
		})
	}

	public async getCrawlStats() {
		const [
			totalPlayers,
			totalMatches,
			totalMatchPlayers,
			totalRounds,
			totalRoundPlayers,
			matchesWithDemos
		] = await Promise.all([
			this.prisma.player.count(),
			this.prisma.match.count(),
			this.prisma.matchPlayer.count(),
			this.prisma.round.count(),
			this.prisma.roundPlayer.count(),
			this.prisma.match.count({
				where: {
					demoFile: {
						not: null
					}
				}
			})
		])

		const avgMatchesPerPlayer =
			totalPlayers > 0 ? totalMatchPlayers / totalPlayers : 0
		const avgRoundsPerMatch =
			totalMatches > 0 ? totalRounds / totalMatches : 0
		const demoFilePercentage =
			totalMatches > 0 ? (matchesWithDemos / totalMatches) * 100 : 0

		return {
			totalPlayers,
			totalMatches,
			totalMatchPlayers,
			totalRounds,
			totalRoundPlayers,
			matchesWithDemos,
			avgMatchesPerPlayer: Math.round(avgMatchesPerPlayer * 100) / 100,
			avgRoundsPerMatch: Math.round(avgRoundsPerMatch * 100) / 100,
			demoFilePercentage: Math.round(demoFilePercentage * 100) / 100
		}
	}

	private extractDemoFileUrl(match: Match): string | null {
		if (!match.roundstatsall || match.roundstatsall.length === 0) {
			return null
		}

		const lastRound = match.roundstatsall[match.roundstatsall.length - 1]

		return lastRound.map || null
	}

	private extractPlayerIds(match: Match): string[] {
		const playerIds = new Set<string>()

		if (match.roundstatsall) {
			for (const round of match.roundstatsall) {
				if (round.reservation?.account_ids) {
					for (const accountId of round.reservation.account_ids) {
						if (accountId) {
							const steamId64 =
								this.accountIdToSteamId64(accountId)
							playerIds.add(steamId64)
						}
					}
				}
			}
		}

		return Array.from(playerIds)
	}

	private calculatePlayerStats(match: Match): Record<
		string,
		{
			slot: number
			team: number | null
			kills: number
			deaths: number
			assists: number
			mvps: number
			score: number
		}
	> {
		const stats: Record<string, any> = {}

		if (!match.roundstatsall) return stats

		for (const round of match.roundstatsall) {
			if (!round.reservation?.account_ids) continue

			round.reservation.account_ids.forEach((accountId, index) => {
				if (!accountId) return

				const steamId64 = this.accountIdToSteamId64(accountId)

				if (!stats[steamId64]) {
					stats[steamId64] = {
						slot: index,
						team: null,
						kills: 0,
						deaths: 0,
						assists: 0,
						mvps: 0,
						score: 0
					}
				}

				stats[steamId64].kills += round.kills?.[index] || 0
				stats[steamId64].deaths += round.deaths?.[index] || 0
				stats[steamId64].assists += round.assists?.[index] || 0
				stats[steamId64].mvps += round.mvps?.[index] || 0
				stats[steamId64].score += round.scores?.[index] || 0
			})
		}

		return stats
	}

	private accountIdToSteamId64(accountId: number): string {
		const baseId = BigInt('76561197960265728')
		return (baseId + BigInt(accountId)).toString()
	}
}
