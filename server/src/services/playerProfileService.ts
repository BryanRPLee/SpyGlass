import { SteamClient } from '../clients/steamClient'
import { PlayerProfile } from '../models/player'

export class PlayerProfileService {
	private steamClient: SteamClient

	constructor(steamClient: SteamClient) {
		this.steamClient = steamClient
	}

	public async getPlayerProfile(
		steamId: string
	): Promise<PlayerProfile | null> {
		if (!this.steamClient.hasGCSession()) {
			throw new Error('Not connected to GC')
		}

		return new Promise((resolve, reject) => {
			const timeout = setTimeout(
				() => reject(new Error('Request timeout')),
				30000
			)
			const csgo = this.steamClient.getCSGOClient()

			const handler = (profile: PlayerProfile) => {
				clearTimeout(timeout)
				csgo.removeListener('playersProfile', handler)
				resolve(profile || null)
			}

			csgo.once('playersProfile', handler)
			try {
				csgo.requestPlayersProfile(steamId)
			} catch (err) {
				clearTimeout(timeout)
				csgo.removeListener('playersProfile', handler)
				reject(err)
			}
		})
	}
}
