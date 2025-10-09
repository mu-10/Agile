
interface Props {
  connectorTypes: string[];
  selectedConnectorTypes: string[];
  setSelectedConnectorTypes: (types: string[]) => void;
  onSelectionChange?: (types: string[]) => void;
}

export default function ConnectorTypeDropdown({
  connectorTypes,
  selectedConnectorTypes,
  setSelectedConnectorTypes,
  onSelectionChange,
}: Props) {
  const allSelected = connectorTypes.length > 0 && selectedConnectorTypes.length === connectorTypes.length;
  const noneSelected = selectedConnectorTypes.length === 0;

  const handleSelectAll = () => {
    let updated: string[];
    if (allSelected) {
      updated = [];
    } else {
      updated = connectorTypes;
    }
    setSelectedConnectorTypes(updated);
    if (onSelectionChange) onSelectionChange(updated);
  };

  const handleTypeChange = (type: string) => {
    let updated: string[];
    if (selectedConnectorTypes.includes(type)) {
      updated = selectedConnectorTypes.filter((t: string) => t !== type);
    } else {
      updated = [...selectedConnectorTypes, type];
    }
    setSelectedConnectorTypes(updated);
    if (onSelectionChange) onSelectionChange(updated);
  };

  return (
    <div style={{ minWidth: 180, maxHeight: 260, overflowY: "auto", fontFamily: "'Google Sans', Roboto, Arial, sans-serif", fontSize: 14 }}>
      <label style={{ display: "block", marginBottom: 8, fontWeight: 500 }}>
        <input
          type="checkbox"
          checked={allSelected}
          onChange={handleSelectAll}
          style={{ marginRight: 8 }}
        />
        Select All
      </label>
      {connectorTypes.map((type) => (
        <label key={type} style={{ display: "block", margin: "6px 0", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={selectedConnectorTypes.includes(type)}
            onChange={() => handleTypeChange(type)}
            style={{ marginRight: 8 }}
          />
          {type}
        </label>
      ))}
    </div>
  );
}
