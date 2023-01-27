const moduleID = 'pf2e-rogues-initiative';


const lg = x => console.log(x);


Hooks.once('init', () => {
    libWrapper.register(moduleID, 'CONFIG.PF2E.Actor.documentClasses.character.prototype.prepareInitiative', prepInit, 'WRAPPER');
});


async function prepInit(wrapped) {    
    wrapped();

    const actor = this;
    if (!this.isOfType('character')) return;
    if (!isRoguesInitiative(actor)) return

    const stat = actor.system.attributes.initiative;
    const ogRoll = stat.roll;
    if (actor[moduleID]) {
        const { options, ogAbility } = actor[moduleID];
        actor[moduleID] = null;
        await ogRoll(options);
        await actor.update({ "system.attributes.initiative.ability": ogAbility });
        return;
    }

    stat.roll = async options => {
        if (!actor.isOfType('character')) return ogRoll.call(actor, options);

        const buttons = {
            normal: {
                label: 'Roll Initiative as Normal'
            },
            stealth: {
                label: 'Roll Initiative using Stealth'
            },
        }
        const rolls = game.messages.filter(m => {
            return m.flags.pf2e?.context?.domains?.includes('stealth') || m.flags.pf2e?.context?.options.find(o => o === 'action:hide' || o === 'action:sneak');
        });
        const lastRolls = rolls.slice(-3);
        for (let i = 1; i < 4; i++) {
            const r = lastRolls.pop();
            if (!r) break;
            const label = r.flags.pf2e?.context?.domains?.includes('stealth')
                ? 'Stealth Check'
                : r.flags.pf2e?.context?.options.find(o => o === 'action:hide')
                    ? 'Hide'
                    : 'Sneak'
            buttons[`roll${i}`] = {
                label: `${label}: ${r.rolls[0].total} (${timeSince(r.timestamp)})`,
                callback: () => {return r.rolls[0].total}
            };
        }
        const choice = await Dialog.wait({
            title: "Rogue's Initiative",
            buttons
        }, { id: moduleID, width: 250 });
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
                    ui.notifications.error(game.i18n.format("PF2E.Encounter.NoTokenInScene", { actor: this.name }));
                    return null;
                }
            })();
            if (!combatant) return;

            return game.combat?.setInitiative(combatant.id, choice);
        }

        if (choice === 'stealth') {
            const ogAbility = stat.ability;
            actor[moduleID] = { options, ogAbility };
            return actor.update({ "system.attributes.initiative.ability": 'ste' });
        }
        
        return ogRoll.call(this, options);
    }
}

function isRoguesInitiative(actor) {
    if (actor.itemTypes.condition.find(c => c.slug === 'hidden')) return true;
    if (actor.itemTypes.effect.find(e => e.name === 'Avoid Notice')) return true;

    return false;
}
