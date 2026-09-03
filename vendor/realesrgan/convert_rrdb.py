# Wandelt RealESRGAN_x4plus.pth (RRDBNet, 23 Blöcke) ohne PyTorch in ein flaches
# Float16-Format für TensorFlow.js um: alle Tensoren nach Namen mit Offset.
import zipfile, pickle, json, sys, numpy as np
from collections import OrderedDict

DTYPES = {'FloatStorage': np.float32, 'HalfStorage': np.float16, 'DoubleStorage': np.float64, 'LongStorage': np.int64, 'IntStorage': np.int32}

def load_pth(path):
    z = zipfile.ZipFile(path)
    names = z.namelist(); prefix = names[0].split('/')[0]
    data = {n.split('/')[-1]: z.read(n) for n in names if '/data/' in n}
    def rebuild(storage, offset, size, stride, *rest):
        arr = np.frombuffer(storage['buf'], dtype=storage['dtype'])
        n = int(np.prod(size)) if len(size) else 1
        return arr[offset:offset + n].reshape(size)
    class U(pickle.Unpickler):
        def find_class(self, mod, name):
            if name == '_rebuild_tensor_v2': return rebuild
            if name in DTYPES: return DTYPES[name]
            if name == 'OrderedDict': return OrderedDict
            raise pickle.UnpicklingError(f'{mod}.{name}')
        def persistent_load(self, pid):
            kind, dtype, key, location, numel = pid
            return {'buf': data[key], 'dtype': dtype}
    return U(z.open(f'{prefix}/data.pkl')).load()

sd = load_pth(sys.argv[1])
sd = sd.get('params_ema') or sd.get('params') or sd
print(len(sd), 'Tensoren; Beispiele:', list(sd.keys())[:4], '...', list(sd.keys())[-4:])
parts, tensors, offset = [], {}, 0
for k, v in sd.items():
    a = v.astype(np.float32)
    if a.ndim == 4: a = np.transpose(a, (2, 3, 1, 0))  # [out,in,kh,kw] -> [kh,kw,in,out]
    a16 = np.ascontiguousarray(a.astype(np.float16))
    tensors[k] = {'offset': offset, 'shape': list(a16.shape)}
    parts.append(a16.ravel()); offset += a16.size
buf = np.concatenate(parts)
buf.tofile(sys.argv[2])
blocks = 1 + max(int(k.split('.')[1]) for k in sd if k.startswith('body.'))
json.dump({'name': 'RealESRGAN_x4plus', 'arch': 'rrdbnet', 'scale': 4, 'numBlocks': blocks, 'dtype': 'float16', 'floats': int(buf.size), 'tensors': tensors}, open(sys.argv[3], 'w'))
print('->', sys.argv[2], buf.size, 'Werte', buf.nbytes, 'Bytes; Blöcke:', blocks, '; conv_first', tensors['conv_first.weight']['shape'], 'conv_last', tensors['conv_last.weight']['shape'])
# Genauigkeitsverlust durch float16
full = np.concatenate([np.transpose(v, (2,3,1,0)).ravel() if v.ndim == 4 else v.ravel() for v in sd.values()]).astype(np.float32)
print('float16-Rundungsfehler: max', float(np.abs(full - buf.astype(np.float32)).max()), 'relativ', float(np.abs(full - buf.astype(np.float32)).max() / np.abs(full).max()))
