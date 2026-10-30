import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useState, type FormEvent, type ReactNode } from "react";
import { parseEventLogs } from "viem";
import { useWriteContract } from "wagmi";
import { launchFactoryAbi } from "../abi";
import { Curve } from "../components/Curve";
import { Card, Row, TxStatusLine } from "../components/ui";
import type { Deployment } from "../deployments";
import { useTx } from "../hooks/useTx";
import { ethToSellOut } from "../lib/auction";
import { validateLaunch, type LaunchForm } from "../lib/launch";
import { formatEth, formatToken } from "../lib/format";
import { launchHref } from "../lib/route";
import type { ChainId } from "../wagmi";

const EMPTY: LaunchForm = { name: "", symbol: "", supply: "", startPrice: "", reservePrice: "" };

function Field({
  id,
  label,
  error,
  help,
  suffix,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  help: string;
  suffix?: string;
  children: ReactNode;
}) {
  return (
    <div className="form-field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <div className={`field field-compact${error ? " field-error" : ""}`}>
        {children}
        {suffix && <span className="field-suffix">{suffix}</span>}
      </div>
      <p className={`field-help${error ? " field-help-error" : ""}`}>{error ?? help}</p>
    </div>
  );
}

export function CreatePage({ deployment, account }: { deployment: Deployment; account?: string }) {
  const chainId = deployment.chainId as ChainId;
  const { openConnectModal } = useConnectModal();
  const { writeContractAsync } = useWriteContract();
  const tx = useTx(chainId);
  const [form, setForm] = useState<LaunchForm>(EMPTY);
  const [touched, setTouched] = useState<Partial<Record<keyof LaunchForm, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);

  const { input, errors } = validateLaunch(form);
  const errorFor = (field: keyof LaunchForm) => (submitted || touched[field] ? errors[field] : undefined);

  const inputProps = (field: keyof LaunchForm) => ({
    id: `create-${field}`,
    autoComplete: "off",
    value: form[field],
    onChange: (event: { target: { value: string } }) => {
      const { value } = event.target;
      setForm((current) => ({ ...current, [field]: value }));
    },
    onBlur: () => setTouched((current) => ({ ...current, [field]: true })),
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (!account) {
      openConnectModal?.();
      return;
    }
    if (!input) return;
    await tx.run(
      "Launch",
      () =>
        writeContractAsync({
          address: deployment.factory.address,
          abi: launchFactoryAbi,
          functionName: "createLaunch",
          args: [input.name, input.symbol, input.supply, input.startPrice, input.reservePrice],
          chainId,
        }),
      (receipt) => {
        const [created] = parseEventLogs({ abi: launchFactoryAbi, eventName: "LaunchCreated", logs: receipt.logs });
        if (created) window.location.hash = launchHref(created.args.id);
      }
    );
  }

  return (
    <div className="page">
      <header className="section-head">
        <h2>Launch a token</h2>
        <p className="muted">One transaction creates your ERC20 token and its auction, and starts the clock. Your wallet becomes the seller.</p>
      </header>

      <div className="layout">
        <div className="layout-main">
          <Card title="Your token">
            <form className="create-form" onSubmit={submit} noValidate>
              <div className="form-grid">
                <Field id="create-name" label="Token name" error={errorFor("name")} help="For example, Horton's">
                  <input {...inputProps("name")} placeholder="Name" />
                </Field>
                <Field id="create-symbol" label="Symbol" error={errorFor("symbol")} help="For example, TIM">
                  <input {...inputProps("symbol")} placeholder="SYMBOL" />
                </Field>
              </div>
              <Field id="create-supply" label="Supply for sale" error={errorFor("supply")} help="All of it goes into the auction. Unsold tokens are burned." suffix={input?.symbol ?? (form.symbol.trim() || "tokens")}>
                <input {...inputProps("supply")} inputMode="decimal" placeholder="1000" />
              </Field>
              <div className="form-grid">
                <Field id="create-startPrice" label="Start price per token" error={errorFor("startPrice")} help="Where bidding opens. At least twice the reserve." suffix="ETH">
                  <input {...inputProps("startPrice")} inputMode="decimal" placeholder="0.1" />
                </Field>
                <Field id="create-reservePrice" label="Reserve price per token" error={errorFor("reservePrice")} help="The lowest the price can go." suffix="ETH">
                  <input {...inputProps("reservePrice")} inputMode="decimal" placeholder="0.02" />
                </Field>
              </div>
              <button className="button button-primary" type="submit" disabled={tx.busy}>
                {!account ? "Connect wallet to launch" : tx.busy ? "Launching…" : "Launch token and start the auction"}
              </button>
              <TxStatusLine status={tx.status} />
            </form>
          </Card>
        </div>

        <div className="layout-side">
          <Card title="What will happen" tone={input ? "accent" : undefined}>
            {input ? (
              <>
                <Curve params={{ totalTokens: input.supply, startPrice: input.startPrice, reservePrice: input.reservePrice }} elapsed={0n} totalCommitted={0n} live={false} />
                <Row label="Token">
                  {input.name} ({input.symbol})
                </Row>
                <Row label="For sale">{formatToken(input.supply, input.symbol)}</Row>
                <Row label="Price falls from">{formatEth(input.startPrice)}</Row>
                <Row label="Down to">{formatEth(input.reservePrice)}</Row>
                <Row label="Sells out for">
                  {formatEth(
                    ethToSellOut({ totalTokens: input.supply, startPrice: input.startPrice, reservePrice: input.reservePrice }, input.reservePrice)
                  )}{" "}
                  to{" "}
                  {formatEth(
                    ethToSellOut({ totalTokens: input.supply, startPrice: input.startPrice, reservePrice: input.reservePrice }, input.startPrice)
                  )}
                </Row>
                <Row label="Runs for">Exactly 20 minutes</Row>
              </>
            ) : (
              <p className="muted">Fill in the form to preview your launch.</p>
            )}
          </Card>
          <Card title="Fixed for every launch">
            <ul className="plain-list">
              <li>The price falls in a straight line for exactly 20 minutes, and you cannot change it afterwards.</li>
              <li>Every winning bidder pays the same final price.</li>
              <li>Any surplus ETH is refunded in the same transaction.</li>
              <li>You can withdraw the ETH raised once the auction settles.</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
