import Landing from "./Landing"
import GardenLanding from "./GardenLanding"
import { useAppearance } from "./components/Appearance"

export default function PublicApp() {
  return useAppearance() === "classic" ? <Landing /> : <GardenLanding />
}
