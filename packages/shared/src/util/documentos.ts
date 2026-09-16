/** Validacao e formatacao de documentos brasileiros usados no cadastro e no CNAB. */

export function somenteDigitos(valor: string): string {
  return (valor ?? '').replace(/\D+/g, '');
}

/** Valida CPF pelos dois digitos verificadores. */
export function cpfValido(valor: string): boolean {
  const cpf = somenteDigitos(valor);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  for (const tamanho of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < tamanho; i += 1) soma += Number(cpf[i]) * (tamanho + 1 - i);
    const resto = (soma * 10) % 11 % 10;
    if (resto !== Number(cpf[tamanho])) return false;
  }
  return true;
}

/** Valida CNPJ pelos dois digitos verificadores. */
export function cnpjValido(valor: string): boolean {
  const cnpj = somenteDigitos(valor);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const calcular = (tamanho: number): number => {
    let soma = 0;
    let peso = tamanho - 7;
    for (let i = 0; i < tamanho; i += 1) {
      soma += Number(cnpj[i]) * peso;
      peso = peso - 1 < 2 ? 9 : peso - 1;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return calcular(12) === Number(cnpj[12]) && calcular(13) === Number(cnpj[13]);
}

/** Valida PIS/PASEP/NIT (11 digitos, modulo 11 com pesos 3..2). */
export function pisValido(valor: string): boolean {
  const pis = somenteDigitos(valor);
  if (pis.length !== 11 || /^(\d)\1{10}$/.test(pis)) return false;
  const pesos = [3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let soma = 0;
  for (let i = 0; i < 10; i += 1) soma += Number(pis[i]) * (pesos[i] as number);
  const resto = soma % 11;
  const digito = resto < 2 ? 0 : 11 - resto;
  return digito === Number(pis[10]);
}

export function formatarCPF(valor: string): string {
  const cpf = somenteDigitos(valor).padStart(11, '0').slice(0, 11);
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
}

export function formatarCNPJ(valor: string): string {
  const cnpj = somenteDigitos(valor).padStart(14, '0').slice(0, 14);
  return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`;
}

/**
 * Valida uma chave PIX conforme o tipo. `ALEATORIA` e um UUID v4, `TELEFONE`
 * segue o formato E.164 brasileiro exigido pelo DICT.
 */
export function chavePixValida(tipo: string, chave: string): boolean {
  const valor = (chave ?? '').trim();
  if (!valor) return false;
  switch (tipo) {
    case 'CPF':
      return cpfValido(valor);
    case 'CNPJ':
      return cnpjValido(valor);
    case 'EMAIL':
      return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(valor) && valor.length <= 77;
    case 'TELEFONE':
      return /^\+55\d{10,11}$/.test(valor);
    case 'ALEATORIA':
      return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(valor);
    default:
      return false;
  }
}
