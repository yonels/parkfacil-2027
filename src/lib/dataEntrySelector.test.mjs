import assert from "node:assert/strict";
import test from "node:test";
import { filteredSelectState } from "./dataEntrySelector.mjs";

test("mantiene seleccionado el estacionamiento activo cuando sigue visible", () => {
  assert.deepEqual(filteredSelectState("parking-a", [{ id: "parking-a" }, { id: "parking-b" }]), {
    value: "parking-a",
    showSelectionPrompt: false,
  });
});

test("fuerza una opcion inicial distinta cuando la busqueda oculta el activo", () => {
  assert.deepEqual(filteredSelectState("parking-a", [{ id: "parking-b" }]), {
    value: "",
    showSelectionPrompt: true,
  });
});

test("no muestra una seleccion artificial cuando no hay resultados", () => {
  assert.deepEqual(filteredSelectState("parking-a", []), {
    value: "",
    showSelectionPrompt: false,
  });
});
