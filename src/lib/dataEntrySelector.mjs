export function filteredSelectState(activeId, options = []) {
  const value = options.some((item) => item.id === activeId) ? activeId : "";
  return {
    value,
    showSelectionPrompt: !value && options.length > 0,
  };
}
