const moduleID = 'pf2e-rogues-initiative';

const lg = (x) => console.log(x);

Hooks.once('init', () => {
	libWrapper.register(
		moduleID,
		'CONFIG.PF2E.Actor.documentClasses.character.prototype.prepareDerivedData',
		prepInit,
		'WRAPPER'
	);
});

async function prepInit(wrapped) {
	const actor = this;

	if (actor[moduleID]) actor.attributes.initiative.statistic = 'stealth';
	wrapped();

	if (!actor.isOfType('character')) return;
	if (!isRoguesInitiative(actor)) return;

	const initiative = actor.initiative;
	const ogRoll = initiative.roll;
	if (actor[moduleID]) {
		const { options, ogAbility } = actor[moduleID];
		actor[moduleID] = null;
		const res = await ogRoll.call(initiative, ...options);
		actor.attributes.initiative.statistic = ogAbility;
		actor.prepareDerivedData();
		return res;
	}

	actor.initiative.roll = async (...options) => {
		if (!actor.isOfType('character')) return ogRoll.call(initiative, ...options);

		const buttons = {
			normal: {
				label: 'Roll Initiative as Normal',
			},
			stealth: {
				label: 'Roll Initiative using Stealth',
			},
		};
		const rolls = game.messages.filter((m) => {
			return (
				m.flags.pf2e?.context?.domains?.includes('stealth') ||
				m.flags.pf2e?.context?.options.find((o) => o === 'action:hide' || o === 'action:sneak')
			);
		});
		const lastRolls = rolls.slice(-3);
		for (let i = 1; i < 4; i++) {
			const r = lastRolls.pop();
			if (!r) break;

			const label = r.flags.pf2e?.context?.domains?.includes('stealth')
				? 'Stealth Check'
				: r.flags.pf2e?.context?.options.find((o) => o === 'action:hide')
				? 'Hide'
				: 'Sneak';
			buttons[`roll${i}`] = {
				label: `${label}: ${r.rolls[0].total} (${timeSince(r.timestamp)})`,
				callback: () => {
					return r.rolls[0].total;
				},
			};
		}
		const choice = await Dialog.wait(
			{
				title: "Rogue's Initiative",
				buttons,
			},
			{ id: moduleID, width: 250 }
		);
		if (!choice) return;

		if (Number.isNumeric(choice)) {
			const combatant = await (async () => {
				const token = this.getActiveTokens().pop();
				const existing = game.combat.combatants.find((combatant) => combatant.actor === this);
				if (existing) {
					return existing;
				} else if (token) {
					await token.toggleCombat(game.combat);
					return token.combatant ?? null;
				} else {
					ui.notifications.error(game.i18n.format('PF2E.Encounter.NoTokenInScene', { actor: this.name }));
					return null;
				}
			})();
			if (!combatant) return;

			return game.combat?.setInitiative(combatant.id, choice);
		}

		if (choice === 'stealth') {
			const ogAbility = actor.attributes.initiative.statistic;
			actor[moduleID] = { options, ogAbility };
			return actor.prepareDerivedData();
		}

		return ogRoll.call(initiative, ...options);
	};
}

function isRoguesInitiative(actor) {
	if (actor.itemTypes.condition.find((c) => c.slug === 'hidden')) return true;
	if (actor.itemTypes.condition.find((c) => c.slug === 'invisible')) return true;
	if (actor.itemTypes.condition.find((c) => c.slug === 'undetected')) return true;
	if (actor.itemTypes.effect.find((e) => e.name === 'Avoid Notice')) return true;
	if (actor.getActiveTokens().some((t) => t.document.hidden)) return true;

	return false;
}
