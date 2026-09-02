# Wandelt Real-ESRGAN-Gewichte (.pth, SRVGGNetCompact) ohne PyTorch in ein
# flaches Float32-Format für TensorFlow.js um.
import zipfile, pickle, json, sys, numpy as np
from collections import OrderedDict

DTYPES = {'FloatStorage': np.float32, 'HalfStorage': np.float16, 'DoubleStorage': np.float64,
          'LongStorage': np.int64, 'IntStorage': np.int32}

def load_pth(path):
    z = zipfile.ZipFile(path)
    names = z.namelist()
    prefix = names[0].split('/')[0]
    data = {n.split('/')[-1]: z.read(n) for n in names if '/data/' in n}
    class Storage:  # Platzhalter für torch.FloatStorage usw.
        def __init__(self, dtype): self.dtype = dtype
    def rebuild(storage, offset, size, stride, *rest):
        arr = np.frombuffer(storage['buf'], dtype=storage['dtype'])
        arr = arr[offset:offset + int(np.prod(size))] if len(size) else arr[offset:offset+1]
        return arr.reshape(size)  # contiguous
    class U(pickle.Unpickler):
        def find_class(self, mod, name):
            if name == '_rebuild_tensor_v2': return rebuild
            if name in DTYPES: return DTYPES[name]
            if name == 'OrderedDict': return OrderedDict
            if mod == 'torch._utils' and name == '_rebuild_parameter': return lambda t, *a: t
            raise pickle.UnpicklingError(f'{mod}.{name}')
        def persistent_load(self, pid):
            kind, dtype, key, location, numel = pid
            return {'buf': data[key], 'dtype': dtype}
    obj = U(z.open(f'{prefix}/data.pkl')).load()
    return obj

def flatten(state):
    for k in ('params_ema', 'params'):
        if k in state: return state[k]
    return state

def export(path, out_bin, manifest_path=None):
    sd = flatten(load_pth(path))
    keys = sorted(sd.keys(), key=lambda k: (int(k.split('.')[1]), k))
    print(path, len(keys), 'Tensoren')
    parts, layers, offset = [], [], 0
    def add(arr):
        nonlocal offset
        a = np.ascontiguousarray(arr.astype(np.float32))
        parts.append(a); o = offset; offset += a.size
        return {'offset': o, 'shape': list(a.shape)}
    idxs = sorted({int(k.split('.')[1]) for k in keys})
    last = idxs[-1]
    for i in idxs:
        w = sd.get(f'body.{i}.weight'); b = sd.get(f'body.{i}.bias')
        if w.ndim == 4:
            if i == last:  # conv_last: Kanalreihenfolge PyTorch pixel_shuffle -> tf.depthToSpace (NHWC)
                out_ch = w.shape[0]; r2 = out_ch // 3
                order = [ (kk % 3) * r2 + (kk // 3) for kk in range(out_ch) ]
                w = w[order]; b = b[order]
            layers.append({'type': 'conv', 'w': add(np.transpose(w, (2, 3, 1, 0))), 'b': add(b)})
        else:
            layers.append({'type': 'prelu', 'a': add(w)})
    buf = np.concatenate([p.ravel() for p in parts])
    buf.tofile(out_bin)
    print(' ->', out_bin, buf.size, 'floats', buf.nbytes, 'bytes; Schichten:', [l['type'] for l in layers][:5], '...', len(layers))
    print(' erste Form', layers[0]['w']['shape'], 'letzte Form', layers[-1]['w']['shape'])
    return layers, buf

la, ba = export('realesr-general-x4v3.pth', 'general.bin')
lb, bb = export('realesr-general-wdn-x4v3.pth', 'wdn.bin')
assert json.dumps(la) == json.dumps(lb), 'Architekturen unterscheiden sich'
json.dump({'name': 'realesr-general-x4v3', 'scale': 4, 'inputRange': [0, 1], 'layers': la, 'floats': int(ba.size)}, open('manifest.json', 'w'))
print('Differenz der Gewichte (mean abs):', float(np.abs(ba - bb).mean()))
