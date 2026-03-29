import { loadConfig } from "../config";
import { getUser, isPrime } from "../services/auth";
import { reverseGeocode } from "../services/address";

const config = await loadConfig();
const [user, prime, address] = await Promise.all([
  getUser(config),
  isPrime(config),
  reverseGeocode(config),
]);

function mask(value: string, visibleStart = 3, visibleEnd = 2): string {
  if (value.length <= visibleStart + visibleEnd) return value;
  const end = visibleEnd > 0 ? value.slice(-visibleEnd) : "";
  return value.slice(0, visibleStart) + "•".repeat(value.length - visibleStart - visibleEnd) + end;
}

const [first, ...rest] = user.name.split(" ");
const maskedName = `${first} ${rest.map((n) => n[0] + "•".repeat(n.length - 1)).join(" ")}`;
const maskedEmail = mask(user.email.split("@")[0]) + "@" + user.email.split("@")[1];
const maskedPhone = user.country_code + "•".repeat(user.phone.length - 4) + user.phone.slice(-4);

console.log(`Name:     ${maskedName}`);
console.log(`Email:    ${maskedEmail}`);
console.log(`Phone:    ${maskedPhone}`);
console.log(`Loyalty:  ${user.loyalty.description} (${user.loyalty.type})`);
console.log(`Prime:    ${prime ? "Yes" : "No"}`);
const loc = address.full_text_to_show || address.original_text;
console.log(`Location: ${mask(loc, Math.ceil(loc.length * 0.7), 0)}`);
console.log(`Coords:   ${config.lat.toFixed(2)}••, ${config.lng.toFixed(2)}••`);
