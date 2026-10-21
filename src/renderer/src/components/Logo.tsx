import logo from '../../../../build/icon.png'

/** Nuvoletta arancione con V e bordo nero, condivisa con l'icona dell'app Windows. */
export function Logo({ size = 26 }: { size?: number }): React.JSX.Element {
  return (
    <img src={logo} width={size} height={size} alt="" aria-hidden="true" draggable={false} />
  )
}
