import { signal } from '@preact/signals'

export type Lang = 'en' | 'vi'
const K = 'odpwa.lang'

function initial(): Lang {
  const s = localStorage.getItem(K)
  if (s === 'en' || s === 'vi') return s
  return 'vi' // default to Vietnamese
}

export const lang = signal<Lang>(initial())
export function setLang(l: Lang): void {
  lang.value = l
  localStorage.setItem(K, l)
}

const EN: Record<string, string> = {
  'tab.vehicle': 'Vehicle',
  'tab.controls': 'Controls',
  'tab.device': 'Settings',

  'common.live': 'Live',
  'common.reconnecting': 'Reconnecting…',
  'common.connected': 'Connected',
  'common.offline': 'Offline',
  'common.ready': 'Ready',
  'common.on': 'On',
  'common.off': 'Off',
  'common.unknown': 'Unknown',
  'common.loading_vehicle': 'Loading vehicle…',
  'common.connecting_car': 'Connecting to your car…',

  'setup.title': 'Connect your car',
  'setup.lede':
    "Enter your OverDrive tunnel or LAN address and the 8-character access code. This is stored on this device only — you'll only do it once.",
  'setup.car_url': 'Car URL',
  'setup.car_url_hint': 'Your cloudflared/zrok tunnel URL, or http://192.168.x.x:8080 on the same Wi-Fi.',
  'setup.access_code': 'Access code',
  'setup.access_code_hint':
    'The 8-character code from OverDrive → Dashboard → Access Code. Tip: enter demo to preview with sample data.',
  'setup.connect': 'Connect',
  'setup.connecting': 'Connecting…',

  'car.range': 'Range',
  'car.charging': 'Charging',
  'car.plugged': 'Plugged in',
  'car.parked': 'Parked',
  'car.ready': 'Ready',
  'car.to': 'to',
  'car.full': 'full',

  'vitals.power': 'Power',
  'vitals.gear': 'Gear',
  'vitals.speed': 'Speed',

  'energy.title': 'Energy',
  'energy.battery': 'Battery',
  'energy.fuel': 'Fuel',
  'energy.range': 'range',

  'tile.battery_health': 'Battery health',
  'tile.cabin_temp': 'Cabin temp',
  'tile.network': 'Network',
  'tile.wifi': 'Wi-Fi',
  'tile.cellular': 'Cellular',
  'tile.v12': '12V battery',

  'charging.title': 'Charging',
  'charging.power': 'Power',
  'charging.state': 'State',
  'charging.full': 'Full',

  'tyre.title': 'Tyre pressure',
  'tyre.unavailable': 'Unavailable — start the car to read TPMS.',

  'status.title': 'Status',
  'status.doors': 'Doors',
  'status.locked': 'Locked',
  'status.unlocked': 'Unlocked',
  'status.windows': 'Windows',
  'status.closed': 'Closed',
  'status.open_count': '{n} open',
  'status.climate': 'Climate',

  'loc.title': 'Location',
  'loc.parked': 'Parked',
  'loc.moving': 'Moving',
  'loc.open_maps': 'Open in Maps',

  'ctrl.lock': 'Lock',
  'ctrl.unlock': 'Unlock',
  'ctrl.flash': 'Flash',
  'ctrl.find': 'Find car',
  'ctrl.trunk': 'Trunk',
  'ctrl.start': 'Start',
  'ctrl.hold': 'hold',
  'ctrl.climate': 'Climate',
  'ctrl.fan': 'Fan',
  'ctrl.windows': 'Windows',
  'ctrl.vent': 'Vent',
  'ctrl.open_all': 'Open all',
  'ctrl.close_all': 'Close all',

  'seat.driver': 'Driver',
  'seat.passenger': 'Passenger',
  'seat.cooling': 'Cooling',
  'seat.heating': 'Heating',
  'level.off': 'Off',
  'level.low': 'Low',
  'level.high': 'High',

  'dev.car_photo': 'Car photo',
  'dev.change_photo': 'Change photo',
  'dev.use_default': 'Use default',
  'dev.connection': 'Connection',
  'dev.car_url': 'Car URL',
  'dev.device': 'Device',
  'dev.app_version': 'App version',
  'dev.build': 'Build',
  'dev.units': 'Units',
  'dev.locale': 'Locale',
  'dev.language': 'Language',
  'dev.integrations': 'Integrations',
  'dev.wicarlink': 'WiCarlink kit (51DK)',
  'dev.wicarlink_desc': 'Replace vehicle controls with 51DK commands',
  'dev.edit_51dk': 'Edit 51DK buttons',
  'dev.refresh': 'Refresh now',
  'dev.sign_out': 'Sign out',
  'dev.footer': 'BYD Sealion 6 Vietnam Group',

  'wc.choose_icon': 'Choose icon',
  'wc.edit_title': 'Edit 51DK',
  'wc.edit_sub': 'Add, remove, reorder or edit buttons',
  'wc.back': 'Back',
  'wc.add': 'Add button',
  'wc.save': 'Save',
  'wc.cancel': 'Cancel',
  'wc.reset': 'Reset defaults',
  'wc.enable_advanced_q': 'Enable advanced actions?',
  'wc.enable': 'Enable',
  'wc.enabling': 'Enabling…',
  'wc.enable_body':
    "51DK buttons run a command on the head unit, which needs OverDrive's “Advanced actions” turned on. Enable it now and run {label}?",
  'wc.shell_note': "shell commands (am / input / adb) need OverDrive's Advanced actions enabled.",
}

const VI: Record<string, string> = {
  'tab.vehicle': 'Xe',
  'tab.controls': 'Điều khiển',
  'tab.device': 'Cài đặt',

  'common.live': 'Trực tiếp',
  'common.reconnecting': 'Đang kết nối lại…',
  'common.connected': 'Đã kết nối',
  'common.offline': 'Ngoại tuyến',
  'common.ready': 'Sẵn sàng',
  'common.on': 'Bật',
  'common.off': 'Tắt',
  'common.unknown': 'Không rõ',
  'common.loading_vehicle': 'Đang tải dữ liệu xe…',
  'common.connecting_car': 'Đang kết nối tới xe…',

  'setup.title': 'Kết nối xe của bạn',
  'setup.lede':
    'Nhập địa chỉ tunnel hoặc LAN của OverDrive và mã truy cập 8 ký tự. Thông tin chỉ lưu trên thiết bị này — bạn chỉ cần nhập một lần.',
  'setup.car_url': 'Địa chỉ xe',
  'setup.car_url_hint': 'URL tunnel cloudflared/zrok của bạn, hoặc http://192.168.x.x:8080 khi cùng Wi-Fi.',
  'setup.access_code': 'Mã truy cập',
  'setup.access_code_hint':
    'Mã 8 ký tự từ OverDrive → Dashboard → Access Code. Mẹo: nhập demo để xem thử với dữ liệu mẫu.',
  'setup.connect': 'Kết nối',
  'setup.connecting': 'Đang kết nối…',

  'car.range': 'Quãng đường',
  'car.charging': 'Đang sạc',
  'car.plugged': 'Đã cắm sạc',
  'car.parked': 'Đang đỗ',
  'car.ready': 'Sẵn sàng',
  'car.to': 'đến',
  'car.full': 'đầy',

  'vitals.power': 'Nguồn',
  'vitals.gear': 'Số',
  'vitals.speed': 'Tốc độ',

  'energy.title': 'Năng lượng',
  'energy.battery': 'Pin',
  'energy.fuel': 'Nhiên liệu',
  'energy.range': 'quãng đường',

  'tile.battery_health': 'Sức khỏe pin',
  'tile.cabin_temp': 'Nhiệt độ khoang',
  'tile.network': 'Mạng',
  'tile.wifi': 'Wi-Fi',
  'tile.cellular': 'Di động',
  'tile.v12': 'Pin 12V',

  'charging.title': 'Đang sạc',
  'charging.power': 'Công suất',
  'charging.state': 'Trạng thái',
  'charging.full': 'Đầy',

  'tyre.title': 'Áp suất lốp',
  'tyre.unavailable': 'Không có dữ liệu — khởi động xe để đọc TPMS.',

  'status.title': 'Trạng thái',
  'status.doors': 'Cửa',
  'status.locked': 'Đã khóa',
  'status.unlocked': 'Mở khóa',
  'status.windows': 'Cửa sổ',
  'status.closed': 'Đã đóng',
  'status.open_count': 'Mở {n}',
  'status.climate': 'Điều hòa',

  'loc.title': 'Vị trí',
  'loc.parked': 'Đang đỗ',
  'loc.moving': 'Đang di chuyển',
  'loc.open_maps': 'Mở trong Maps',

  'ctrl.lock': 'Khóa',
  'ctrl.unlock': 'Mở khóa',
  'ctrl.flash': 'Nháy đèn',
  'ctrl.find': 'Tìm xe',
  'ctrl.trunk': 'Cốp',
  'ctrl.start': 'Khởi động',
  'ctrl.hold': 'giữ',
  'ctrl.climate': 'Điều hòa',
  'ctrl.fan': 'Quạt',
  'ctrl.windows': 'Cửa sổ',
  'ctrl.vent': 'Hé cửa',
  'ctrl.open_all': 'Mở hết',
  'ctrl.close_all': 'Đóng hết',

  'seat.driver': 'Ghế lái',
  'seat.passenger': 'Ghế phụ',
  'seat.cooling': 'Làm mát',
  'seat.heating': 'Sưởi',
  'level.off': 'Tắt',
  'level.low': 'Thấp',
  'level.high': 'Cao',

  'dev.car_photo': 'Ảnh xe',
  'dev.change_photo': 'Đổi ảnh',
  'dev.use_default': 'Mặc định',
  'dev.connection': 'Kết nối',
  'dev.car_url': 'Địa chỉ xe',
  'dev.device': 'Thiết bị',
  'dev.app_version': 'Phiên bản app',
  'dev.build': 'Bản dựng',
  'dev.units': 'Đơn vị',
  'dev.locale': 'Vùng',
  'dev.language': 'Ngôn ngữ',
  'dev.integrations': 'Tích hợp',
  'dev.wicarlink': 'Bộ WiCarlink (51DK)',
  'dev.wicarlink_desc': 'Thay điều khiển xe bằng lệnh 51DK',
  'dev.edit_51dk': 'Sửa nút 51DK',
  'dev.refresh': 'Làm mới',
  'dev.sign_out': 'Đăng xuất',
  'dev.footer': 'BYD Sealion 6 Vietnam Group',

  'wc.choose_icon': 'Chọn biểu tượng',
  'wc.edit_title': 'Sửa 51DK',
  'wc.edit_sub': 'Thêm, xóa, sắp xếp hoặc sửa nút',
  'wc.back': 'Quay lại',
  'wc.add': 'Thêm nút',
  'wc.save': 'Lưu',
  'wc.cancel': 'Hủy',
  'wc.reset': 'Đặt lại mặc định',
  'wc.enable_advanced_q': 'Bật hành động nâng cao?',
  'wc.enable': 'Bật',
  'wc.enabling': 'Đang bật…',
  'wc.enable_body':
    'Nút 51DK chạy một lệnh trên màn hình xe, cần bật “Hành động nâng cao” của OverDrive. Bật ngay và chạy {label}?',
  'wc.shell_note': 'Lệnh shell (am / input / adb) cần bật Hành động nâng cao trong OverDrive.',
}

const DICT: Record<Lang, Record<string, string>> = { en: EN, vi: VI }

export function t(key: string, params?: Record<string, string | number>): string {
  let s = DICT[lang.value][key] ?? EN[key] ?? key
  if (params) for (const k in params) s = s.replace(`{${k}}`, String(params[k]))
  return s
}
