import { SteamClient } from '../clients/steamClient'
import { Match } from '../models/match'
import SteamID from 'steamid'

export class MatchHistoryService {
	private steamClient: SteamClient

	constructor(steamClient: SteamClient) {
		this.steamClient = steamClient
	}

	public async getPlayerMatchHistory(steamId: string): Promise<Match[]> {
		if (!this.steamClient.hasGCSession()) {
			throw new Error('Not connected to GC')
		}

		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				csgo.removeListener('matchList', handler)
				console.warn(
					`Timeout: No match data received for ${steamId} after 30s`
				)
				console.warn(
					`This usually means: no CS2 matches, private settings, or account doesn't own CS2`
				)
				resolve([])
			}, 30000)
			const csgo = this.steamClient.getCSGOClient()

			const handler = (matches: Match[], requestType: any) => {
				clearTimeout(timeout)
				csgo.removeListener('matchList', handler)

				console.log(`Received match list for ${steamId}:`, {
					matchCount: matches?.length || 0,
					requestType: requestType
				})

				resolve(matches || [])
			}

			csgo.once('matchList', handler)

			try {
				const sid = new SteamID(steamId)
				console.log(
					`Requesting matches for SteamID: ${steamId} (AccountID: ${sid.accountid})`
				)
				csgo.requestRecentGames(sid)
			} catch (err) {
				clearTimeout(timeout)
				csgo.removeListener('matchList', handler)
				console.error(
					`Error sending match request for ${steamId}:`,
					err
				)
				reject(err)
			}
		})
	}

	public async getMatchDetails(
		steamId: string,
		matchId: string
	): Promise<Match | null> {
		if (!this.steamClient.hasGCSession()) {
			throw new Error('Not connected to GC')
		}

		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				csgo.removeListener('matchList', handler)
				console.warn(`No match details received for ${steamId}`)
				resolve(null)
			}, 30000)
			const csgo = this.steamClient.getCSGOClient()

			const handler = (matches: Match[]) => {
				clearTimeout(timeout)
				csgo.removeListener('matchList', handler)

				const match = matches.find((m) => m.matchid === matchId)
				resolve(match || null)
			}

			csgo.once('matchList', handler)
			try {
				const sid = new SteamID(steamId)
				csgo.requestRecentGames(sid)
			} catch (err) {
				clearTimeout(timeout)
				csgo.removeListener('matchList', handler)
				reject(err)
			}
		})
	}
}
