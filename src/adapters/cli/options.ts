export function optionValue(args: string[], name: string): string | undefined {
  const equalsPrefix = `${name}=`
  const equalsValue = args.find((arg) => arg.startsWith(equalsPrefix))
  if (equalsValue) return equalsValue.slice(equalsPrefix.length)

  const index = args.indexOf(name)
  return index === -1 ? undefined : args[index + 1]
}
