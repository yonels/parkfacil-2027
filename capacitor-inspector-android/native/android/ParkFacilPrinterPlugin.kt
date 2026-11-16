package cl.parkfacil.inspector

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothSocket
import android.os.Build
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import java.io.IOException
import java.io.OutputStream
import java.util.UUID

/**
 * ParkFacilPrinterPlugin (Inspector, Etapa 3 final -- Capacitor/Android,
 * 2026-08-31). Bluetooth Classic SPP REAL para la impresora térmica
 * GOOJPRT MTP-II -- confirmado por auditoría de esta misma tarea que la
 * MTP-II usa Bluetooth Clásico (no BLE): en PC está emparejada como
 * puerto COM virtual, exactamente el mismo mecanismo (Serial Port
 * Profile) que este plugin implementa aquí de forma nativa. Web
 * Bluetooth NUNCA podría alcanzar este dispositivo (solo habla BLE/GATT)
 * -- por eso este plugin existe: es la ÚNICA vía real desde Android.
 *
 * SPP_UUID es el UUID ESTÁNDAR del Bluetooth SIG para el perfil de
 * puerto serie (Serial Port Profile) -- a diferencia de un servicio BLE
 * (que cada fabricante define a su gusto y hay que adivinar), el UUID de
 * SPP es SIEMPRE el mismo en cualquier dispositivo Bluetooth Clásico que
 * lo implemente, así que no hace falta "adivinar" nada aquí.
 *
 * Contrato expuesto a JS (ver src/lib/inspector/printerAdapter.js en el
 * repo Next.js, que es quien llama a este plugin por su nombre exacto
 * "ParkFacilPrinter"):
 *   listPairedDevices() -> { devices: [{ deviceId, name }] }
 *   connect({ deviceId }) -> { ok, code, message }
 *   disconnect() -> { ok: true }
 *   getStatus() -> { connected, deviceId, deviceName }
 *   printBytes({ dataBase64 }) -> { ok, code, message }
 *
 * NO COMPILADO NI PROBADO EN ESTE ENTORNO (sin Android Studio/SDK aquí)
 * -- ver capacitor-inspector-android/README.md para el paso a paso real
 * de cómo instalar este archivo dentro del proyecto Android generado por
 * Capacitor, compilarlo y probarlo contra la MTP-II física.
 */
@CapacitorPlugin(
  name = "ParkFacilPrinter",
  permissions = [
    Permission(strings = [Manifest.permission.BLUETOOTH_CONNECT], alias = "bluetoothConnect"),
  ],
)
class ParkFacilPrinterPlugin : Plugin() {
  companion object {
    // UUID estándar Bluetooth SIG para Serial Port Profile (SPP) -- igual
    // en cualquier impresora térmica Bluetooth Clásico, no solo la MTP-II.
    private val SPP_UUID: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
  }

  private var socket: BluetoothSocket? = null
  private var outputStream: OutputStream? = null
  private var connectedDeviceId: String? = null
  private var connectedDeviceName: String? = null

  // Android 12+ (API 31) exige el permiso runtime BLUETOOTH_CONNECT para
  // listar/conectar dispositivos ya emparejados -- versiones anteriores
  // no lo requieren (alcanza con el permiso normal declarado en el
  // Manifest, ver AndroidManifest.additions.xml). No se pide
  // ACCESS_FINE_LOCATION porque este plugin NUNCA escanea en vivo, solo
  // lista los dispositivos YA EMPAREJADOS (bondedDevices) -- ese permiso
  // solo hace falta para descubrimiento activo, que aquí no existe.
  private fun hasBluetoothPermission(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
    return getPermissionState("bluetoothConnect") == com.getcapacitor.PermissionState.GRANTED
  }

  private fun bluetoothAdapter(): BluetoothAdapter? = BluetoothAdapter.getDefaultAdapter()

  @PluginMethod
  fun listPairedDevices(call: PluginCall) {
    if (!hasBluetoothPermission()) {
      requestPermissionForAlias("bluetoothConnect", call, "listPairedDevicesCallback")
      return
    }
    resolveListPairedDevices(call)
  }

  @PermissionCallback
  private fun listPairedDevicesCallback(call: PluginCall) {
    if (!hasBluetoothPermission()) {
      call.reject("Permiso de Bluetooth denegado.", "BLUETOOTH_PERMISSION_DENIED")
      return
    }
    resolveListPairedDevices(call)
  }

  private fun resolveListPairedDevices(call: PluginCall) {
    val adapter = bluetoothAdapter()
    if (adapter == null || !adapter.isEnabled) {
      call.reject("Bluetooth está apagado en este teléfono.", "BLUETOOTH_DISABLED")
      return
    }
    val devices = JSArray()
    for (device: BluetoothDevice in adapter.bondedDevices) {
      val entry = JSObject()
      entry.put("deviceId", device.address)
      entry.put("name", device.name ?: device.address)
      devices.put(entry)
    }
    val result = JSObject()
    result.put("devices", devices)
    call.resolve(result)
  }

  @PluginMethod
  fun connect(call: PluginCall) {
    val deviceId = call.getString("deviceId")
    if (deviceId.isNullOrBlank()) {
      call.reject("Falta deviceId.", "INVALID_ARGUMENT")
      return
    }
    if (!hasBluetoothPermission()) {
      call.reject("Permiso de Bluetooth no concedido.", "BLUETOOTH_PERMISSION_DENIED")
      return
    }
    val adapter = bluetoothAdapter()
    if (adapter == null || !adapter.isEnabled) {
      val response = JSObject()
      response.put("ok", false)
      response.put("code", "BLUETOOTH_DISABLED")
      response.put("message", "Bluetooth está apagado en este teléfono.")
      call.resolve(response)
      return
    }

    // Se ejecuta fuera del hilo principal (createRfcommSocketToServiceRecord
    // + connect() son operaciones de E/S bloqueantes, igual criterio que
    // cualquier conexión Bluetooth Clásico en Android).
    Thread {
      try {
        closeSocketQuietly()
        val device = adapter.getRemoteDevice(deviceId)
        // Cancelar el descubrimiento antes de conectar es una recomendación
        // oficial de Android -- un descubrimiento activo en curso puede
        // hacer fallar/lentificar la conexión RFCOMM.
        adapter.cancelDiscovery()
        val newSocket = device.createRfcommSocketToServiceRecord(SPP_UUID)
        newSocket.connect()
        socket = newSocket
        outputStream = newSocket.outputStream
        connectedDeviceId = deviceId
        connectedDeviceName = device.name ?: deviceId

        val response = JSObject()
        response.put("ok", true)
        response.put("code", "CONNECTED")
        response.put("message", "")
        call.resolve(response)
      } catch (error: IOException) {
        closeSocketQuietly()
        val response = JSObject()
        response.put("ok", false)
        response.put("code", "PRINTER_OFFLINE")
        response.put("message", error.message ?: "No fue posible conectar. Verifica que la impresora esté encendida, cerca y emparejada.")
        call.resolve(response)
      } catch (error: SecurityException) {
        val response = JSObject()
        response.put("ok", false)
        response.put("code", "BLUETOOTH_PERMISSION_DENIED")
        response.put("message", error.message ?: "Permiso de Bluetooth denegado.")
        call.resolve(response)
      }
    }.start()
  }

  @PluginMethod
  fun disconnect(call: PluginCall) {
    closeSocketQuietly()
    val response = JSObject()
    response.put("ok", true)
    call.resolve(response)
  }

  @PluginMethod
  fun getStatus(call: PluginCall) {
    val response = JSObject()
    response.put("connected", socket?.isConnected == true)
    response.put("deviceId", connectedDeviceId)
    response.put("deviceName", connectedDeviceName)
    call.resolve(response)
  }

  @PluginMethod
  fun printBytes(call: PluginCall) {
    val base64 = call.getString("dataBase64")
    if (base64.isNullOrBlank()) {
      call.reject("Falta dataBase64.", "INVALID_ARGUMENT")
      return
    }
    val stream = outputStream
    if (stream == null || socket?.isConnected != true) {
      val response = JSObject()
      response.put("ok", false)
      response.put("code", "PRINTER_NOT_CONNECTED")
      response.put("message", "La impresora no está conectada. Conéctala e intenta nuevamente.")
      call.resolve(response)
      return
    }

    // E/S bloqueante -- fuera del hilo principal, igual que connect().
    Thread {
      try {
        val bytes = android.util.Base64.decode(base64, android.util.Base64.DEFAULT)
        stream.write(bytes)
        stream.flush()
        val response = JSObject()
        response.put("ok", true)
        response.put("code", "PRINT_OK")
        response.put("message", "")
        call.resolve(response)
      } catch (error: IOException) {
        // La escritura falló -- casi siempre significa que la impresora se
        // apagó o quedó fuera de rango durante el intento. Se cierra el
        // socket y se refleja el estado real (desconectada) para que la UI
        // de Inspector lo muestre correctamente en el próximo getStatus().
        closeSocketQuietly()
        val response = JSObject()
        response.put("ok", false)
        response.put("code", "PRINTER_OFFLINE")
        response.put("message", error.message ?: "No fue posible imprimir. Verifica que la impresora esté encendida y cerca.")
        call.resolve(response)
      }
    }.start()
  }

  private fun closeSocketQuietly() {
    try { outputStream?.close() } catch (_: IOException) { /* no-op */ }
    try { socket?.close() } catch (_: IOException) { /* no-op */ }
    outputStream = null
    socket = null
    connectedDeviceId = null
    connectedDeviceName = null
  }

  override fun handleOnDestroy() {
    closeSocketQuietly()
    super.handleOnDestroy()
  }
}
