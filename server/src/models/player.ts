export interface PlayerRanking {
	account_id: number
	rank_id: number
	wins: number
	rank_change: number | null
	rank_type_id: number
}

export interface PlayerCommendation {
	cmd_friendly: number
	cmd_teaching: number
	cmd_leader: number
}

export interface PlayerMedals {
	medal_team?: number
	medal_combat?: number
	medal_weapon?: number
	medal_global?: number
	medal_arms?: number
	display_items_defidx?: number[]
	featured_display_item_defidx?: number
}

export interface PlayerProfile {
	account_id: number
	ongoingmatch?: any
	global_stats?: any | null
	penalty_seconds?: number
	penalty_reason?: number
	vac_banned?: boolean
	ranking?: PlayerRanking
	commendation?: PlayerCommendation
	medals?: PlayerMedals
	my_current_event?: any
	my_current_event_teams?: any
	my_current_team?: any
	my_current_event_stages?: any
	survey_vote?: any
	activity?: any
	player_level?: number
	player_cur_xp?: number
	player_xp_bonus_flags?: any | null
	rankings?: PlayerRanking[]
}
