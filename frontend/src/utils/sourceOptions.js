export function buildDefaultSourceOptionSelection(providers = []) {
    return providers.reduce((selection, provider) => {
        if (!provider.source_options?.length) {
            return selection;
        }

        selection[provider.id] = provider.source_options.reduce((providerSelection, optionGroup) => {
            providerSelection[optionGroup.id] = [...(optionGroup.default_selected_ids || [])];
            return providerSelection;
        }, {});

        return selection;
    }, {});
}

export function toggleSourceOptionSelection(currentSelection, sourceId, optionGroupId, optionId) {
    const currentIds = currentSelection?.[sourceId]?.[optionGroupId] || [];
    const nextIds = currentIds.includes(optionId)
        ? currentIds.filter((id) => id !== optionId)
        : [...currentIds, optionId];

    return {
        ...currentSelection,
        [sourceId]: {
            ...(currentSelection?.[sourceId] || {}),
            [optionGroupId]: nextIds
        }
    };
}

export function getSelectedSourceOptionIds(currentSelection, sourceId, optionGroupId) {
    return currentSelection?.[sourceId]?.[optionGroupId] || [];
}

export function getMergedSourceOptionGroups(providers = [], selectedSourceIds = []) {
    const groupMap = new Map();

    providers
        .filter((provider) => selectedSourceIds.includes(provider.id))
        .forEach((provider) => {
            (provider.source_options || []).forEach((optionGroup) => {
                const existing = groupMap.get(optionGroup.id) || {
                    id: optionGroup.id,
                    label: optionGroup.label,
                    helper_text: optionGroup.helper_text,
                    source_ids: [],
                    option_map: new Map()
                };

                existing.source_ids.push(provider.id);
                for (const option of optionGroup.options || []) {
                    existing.option_map.set(option.id, option);
                }

                groupMap.set(optionGroup.id, existing);
            });
        });

    return [...groupMap.values()].map((group) => ({
        id: group.id,
        label: group.label,
        helper_text: group.helper_text,
        source_ids: group.source_ids,
        options: [...group.option_map.values()]
    }));
}

export function getMergedSelectedSourceOptionIds(currentSelection, sourceIds = [], optionGroupId) {
    const merged = new Set();

    for (const sourceId of sourceIds) {
        for (const optionId of currentSelection?.[sourceId]?.[optionGroupId] || []) {
            merged.add(optionId);
        }
    }

    return [...merged];
}
