"""Scope Panoramax 5.3.1 and replace its bandwidth probe with SD-first loading."""
import pathlib,sys
source=pathlib.Path(sys.argv[1]).read_text()
start=source.index('function Ao(){');end=source.index('function mo(',start)
assert 'navigator.connection.downlink' in source[start:end] and 'Failed to run speedtest' in source[start:end]
source=source[:start]+'function Ao(){return Promise.resolve(false)}'+source[end:]
pathlib.Path(sys.argv[2]).write_text('(function(exports){\n'+source+'\n})({});\n')
